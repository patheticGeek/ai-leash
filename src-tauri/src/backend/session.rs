//! The chat commands, one per operation rather than one per backend kind:
//! each resolves `backend_id` through the registry and calls the `Backend`.

use super::registry;
use crate::state::AppState;
use tauri::{AppHandle, State};

/// Runs the user's `message` on `session_id` with backend `backend_id`.
/// `model`/`effort` are the conversation's choice; a native backend also
/// remembers `model` as the one to start with next time.
#[tauri::command]
pub async fn send_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    backend_id: String,
    model: String,
    effort: Option<String>,
    message: String,
) -> Result<(), String> {
    let backend = registry::resolve(&state, &backend_id, &model, effort.as_deref())?;
    registry::remember_model(&app, &backend_id, &model);
    backend.send(&app, &session_id, message).await
}

/// Answers the last user message again from scratch — see
/// `Backend::retry`.
#[tauri::command]
pub async fn retry_last(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    backend_id: String,
    model: String,
    effort: Option<String>,
) -> Result<(), String> {
    let backend = registry::resolve(&state, &backend_id, &model, effort.as_deref())?;
    backend.retry(&app, &session_id).await
}

/// The local "/compact" command — see `Backend::compact`. Resolves to the
/// summary so the frontend can show it without reloading the transcript.
#[tauri::command]
pub async fn compact_conversation(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    backend_id: String,
    model: String,
) -> Result<String, String> {
    let backend = registry::resolve(&state, &backend_id, &model, None)?;
    backend.compact(&app, &session_id).await
}

/// Gets `backend_id` ready for `session_id` ahead of the first message — see
/// `Backend::warm`. `async` so it runs on the async runtime: a sync command
/// runs on the main thread, where there's none to spawn the connection on.
#[tauri::command]
pub async fn warm_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    backend_id: String,
) -> Result<(), String> {
    registry::resolve(&state, &backend_id, "", None)?.warm(&app, &session_id);
    Ok(())
}
