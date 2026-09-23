use crate::db;
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
    /// The top-level conversation `session_id` was spawned by, when it's a
    /// sub-agent — a sub-agent has no textarea of its own, so its request is
    /// shown above (and glows the sidebar row of) this conversation instead.
    /// Resolved here, backend-side, because the frontend can't reliably: it
    /// only hears a conversation's `subtask_start` while that conversation
    /// is the one mounted.
    parent_session_id: Option<String>,
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
    let parent_session_id = state
        .sub_agent_parents
        .lock()
        .unwrap()
        .get(session_id)
        .cloned();
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
            parent_session_id,
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
/// in `ChatPanel.tsx`, next to the model picker. The bypass flag itself is
/// in-memory only (enforcement has to be instant, so it can't round-trip
/// through SQLite) and always flips, regardless of `persist`.
///
/// The choice is also persisted to `conversations.permission_mode`, but only
/// when `persist` is true — the frontend passes `false` for a still-unsent
/// "new thread" conversation (mirrors `commands::set_conversation_root`'s
/// own `conversation_exists` guard, same reasoning: a thread nobody's typed
/// into yet shouldn't leave a row behind just because this re-sends on every
/// mount — see `useSessionPermissions.ts`). Whether that row exists yet is
/// decided by the frontend, not re-derived here from `conversation_exists`:
/// `conversationSlice.markConversationStarted` — which flips a thread from
/// unsent to real — runs *before* the row lands (it's optimistic, ahead of
/// `save_message`'s own round trip), so a same-moment DB-existence check
/// here would still see "not yet" and this choice would never get flushed at
/// all.
#[tauri::command]
pub fn set_permission_mode(
    app: AppHandle,
    state: State<AppState>,
    session_id: String,
    project_root: String,
    bypass: bool,
    persist: bool,
) -> Result<(), String> {
    let mut bypass_set = state.permission_bypass.lock().unwrap();
    if bypass {
        bypass_set.insert(session_id.clone());
    } else {
        bypass_set.remove(&session_id);
    }
    drop(bypass_set);
    if persist {
        db::set_conversation_permission_mode(
            &state.db,
            &session_id,
            &project_root,
            if bypass { "bypass" } else { "ask" },
        );
        // See `chat::history::emit_conversation_changed`'s doc comment — same
        // event, inlined rather than shared across the module boundary for
        // one call site.
        let _ = app.emit(
            "conversation://changed",
            json!({ "conversationId": session_id, "reason": "permission" }),
        );
    }
    Ok(())
}
