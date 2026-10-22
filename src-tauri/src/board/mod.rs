//! Project boards: a Kanban board of tasks per project (see `db/tasks.rs`
//! and `db/epics.rs` for storage). This module is the Tauri command surface
//! the board UI calls, plus `emit_board_changed`, which every write — from
//! the UI or from an agent's tool call — goes through so open boards
//! refresh.

use crate::db::{self, Epic, EpicPatch, NewEpic, NewTask, Task, TaskPatch};
use crate::state::AppState;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

/// How far back the Done column reaches by default, in seconds — the
/// rest is behind "load older".
const RECENT_DONE_WINDOW_SECS: i64 = 30 * 24 * 60 * 60;

/// Tells the frontend one project's board changed. Global with the project
/// in the payload, like `conversation://changed`; the payload only names
/// what changed, so listeners refetch rather than patch.
pub fn emit_board_changed(
    app: &AppHandle,
    project_root: &str,
    task_id: Option<&str>,
    reason: &str,
) {
    let _ = app.emit(
        "board://changed",
        json!({ "projectRoot": project_root, "taskId": task_id, "reason": reason }),
    );
}

/// `emit_board_changed` for a project known only by id (a task or epic row).
pub fn emit_board_changed_for(
    app: &AppHandle,
    state: &AppState,
    project_id: &str,
    task_id: Option<&str>,
    reason: &str,
) {
    if let Some(root) = db::project_root_for_id(&state.db, project_id) {
        emit_board_changed(app, &root, task_id, reason);
    }
}

/// Everything one board renders, in one round trip.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub tasks: Vec<Task>,
    pub epics: Vec<Epic>,
    /// Every done task, including those `tasks` leaves out.
    pub done_count: i64,
    /// Whether several tasks may run at once in a non-git project's main
    /// checkout — see `db::parallel_main_checkout_tasks`.
    pub parallel_main_checkout_tasks: bool,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn get_board(
    state: State<AppState>,
    project_root: String,
    include_older_done: bool,
) -> Result<Board, String> {
    let done_since = (!include_older_done).then(|| now() - RECENT_DONE_WINDOW_SECS);
    Ok(Board {
        tasks: db::list_tasks(&state.db, &project_root, done_since),
        epics: db::list_epics(&state.db, &project_root),
        done_count: db::count_done_tasks(&state.db, &project_root),
        parallel_main_checkout_tasks: db::parallel_main_checkout_tasks(&state.db, &project_root),
    })
}

#[tauri::command]
pub fn create_task(
    app: AppHandle,
    state: State<AppState>,
    project_root: String,
    task: NewTask,
) -> Result<Task, String> {
    let task = db::create_task(&state.db, &project_root, task)?;
    emit_board_changed(&app, &project_root, Some(&task.id), "created");
    Ok(task)
}

#[tauri::command]
pub fn update_task(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
    patch: TaskPatch,
) -> Result<Task, String> {
    let task = db::update_task(&state.db, &task_id, patch)?;
    emit_board_changed_for(&app, &state, &task.project_id, Some(&task.id), "updated");
    Ok(task)
}

/// Drag and drop: `task_id` goes into `status`, just before
/// `before_task_id` (or at the end of the column).
#[tauri::command]
pub fn move_task(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
    status: String,
    before_task_id: Option<String>,
) -> Result<Task, String> {
    let task = db::move_task(&state.db, &task_id, &status, before_task_id.as_deref())?;
    emit_board_changed_for(&app, &state, &task.project_id, Some(&task.id), "moved");
    Ok(task)
}

/// Removes a task from the board. Its chat, if it was started, stays as an
/// ordinary conversation.
#[tauri::command]
pub fn delete_task(app: AppHandle, state: State<AppState>, task_id: String) -> Result<(), String> {
    if let Some(task) = db::delete_task(&state.db, &task_id) {
        emit_board_changed_for(&app, &state, &task.project_id, Some(&task.id), "deleted");
    }
    Ok(())
}

#[tauri::command]
pub fn create_epic(
    app: AppHandle,
    state: State<AppState>,
    project_root: String,
    epic: NewEpic,
) -> Result<Epic, String> {
    let epic = db::create_epic(&state.db, &project_root, epic)?;
    emit_board_changed(&app, &project_root, None, "epic");
    Ok(epic)
}

#[tauri::command]
pub fn update_epic(
    app: AppHandle,
    state: State<AppState>,
    epic_id: String,
    patch: EpicPatch,
) -> Result<Epic, String> {
    let epic = db::update_epic(&state.db, &epic_id, patch)?;
    emit_board_changed_for(&app, &state, &epic.project_id, None, "epic");
    Ok(epic)
}

#[tauri::command]
pub fn delete_epic(app: AppHandle, state: State<AppState>, epic_id: String) -> Result<(), String> {
    if let Some(epic) = db::delete_epic(&state.db, &epic_id) {
        emit_board_changed_for(&app, &state, &epic.project_id, None, "epic");
    }
    Ok(())
}

#[tauri::command]
pub fn set_parallel_main_checkout_tasks(
    app: AppHandle,
    state: State<AppState>,
    project_root: String,
    allowed: bool,
) -> Result<(), String> {
    db::set_parallel_main_checkout_tasks(&state.db, &project_root, allowed);
    emit_board_changed(&app, &project_root, None, "settings");
    Ok(())
}

/// Forgets a project's whole board, for when the project itself is removed
/// from the app.
#[tauri::command]
pub fn delete_project_board(
    app: AppHandle,
    state: State<AppState>,
    project_root: String,
) -> Result<(), String> {
    db::delete_project_board(&state.db, &project_root);
    emit_board_changed(&app, &project_root, None, "deleted");
    Ok(())
}
