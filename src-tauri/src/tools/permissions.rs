use crate::state::AppState;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PermissionRequest {
    id: String,
    /// Which project (or sub-agent — see `permissionForSession` in
    /// `store.ts`) this came from, so the frontend can route the popover to
    /// the right `ChatPanel` and glow the right sidebar row instead of
    /// showing one global modal for every project at once.
    session_id: String,
    kind: String,
    title: String,
    detail: String,
}

pub(crate) async fn request_permission(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    kind: &str,
    title: String,
    detail: String,
) -> bool {
    if state.permission_bypass.lock().unwrap().contains(session_id) {
        return true;
    }
    let id = Uuid::new_v4().to_string();
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .pending_permissions
        .lock()
        .unwrap()
        .insert(id.clone(), tx);
    let _ = app.emit(
        "permission://request",
        PermissionRequest {
            id,
            session_id: session_id.to_string(),
            kind: kind.into(),
            title,
            detail,
        },
    );
    rx.await.unwrap_or(false)
}

/// Resolves a pending request and lets every subscriber (not just whichever
/// `ChatPanel`/popover instance happened to call this — a sub-agent's
/// request is answered from its *parent* project's popover, see
/// `permissionForSession` in `store.ts`) know it's no longer pending, via
/// `permission://resolved`. Frontend state (`pendingPermissions` in
/// `store.ts`) is keyed by `sessionId`, not `id`, so the event only needs to
/// carry `id` — the store already knows how to find which session's entry
/// that belongs to.
#[tauri::command]
pub fn respond_permission(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    approved: bool,
) -> Result<(), String> {
    if let Some(tx) = state.pending_permissions.lock().unwrap().remove(&id) {
        let _ = tx.send(approved);
        let _ = app.emit("permission://resolved", json!({ "id": id }));
        Ok(())
    } else {
        Err("no such permission request".into())
    }
}

/// Flips a session between "ask" (the default — every edit/shell/ACP
/// permission request goes through `request_permission`'s popover) and
/// "bypass" (auto-approved, no prompt at all) — see the Ask/Bypass selector
/// in `ChatPanel.tsx`, next to the model picker. Backend-only state (not
/// persisted to SQLite), so the frontend re-sends this once per session on
/// mount to restore whatever the user last chose (it persists that choice
/// itself, in localStorage).
#[tauri::command]
pub fn set_permission_mode(
    state: State<AppState>,
    session_id: String,
    bypass: bool,
) -> Result<(), String> {
    let mut bypass_set = state.permission_bypass.lock().unwrap();
    if bypass {
        bypass_set.insert(session_id);
    } else {
        bypass_set.remove(&session_id);
    }
    Ok(())
}
