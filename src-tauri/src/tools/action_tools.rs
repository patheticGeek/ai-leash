use super::request_permission;
use crate::actions;
use crate::state::AppState;
use serde_json::Value;
use std::path::Path;
use tauri::{AppHandle, State};

pub(super) async fn create_action(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    root: &Path,
    args: &Value,
) -> Result<String, String> {
    let action_name = args
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("missing `name`")?;
    let command = args
        .get("command")
        .and_then(|v| v.as_str())
        .ok_or("missing `command`")?;
    let approved = request_permission(
        app,
        state,
        session_id,
        "edit",
        format!("Add action `{action_name}`"),
        command.into(),
    )
    .await;
    if !approved {
        return Ok("The user denied permission to add this action.".into());
    }
    actions::create_action_tool(root, action_name, command)
}

pub(super) fn run_action(app: &AppHandle, root: &Path, args: &Value) -> Result<String, String> {
    let action_name = args
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("missing `name`")?;
    actions::run_action(app, root, action_name)
}

pub(super) fn stop_action(app: &AppHandle, root: &Path, args: &Value) -> Result<String, String> {
    let action_name = args
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("missing `name`")?;
    actions::stop_action(app, root, action_name)
}

pub(super) fn list_actions(app: &AppHandle, root: &Path) -> Result<String, String> {
    Ok(actions::list_actions_status(app, root))
}

pub(super) fn read_action(app: &AppHandle, root: &Path, args: &Value) -> Result<String, String> {
    let action_name = args
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("missing `name`")?;
    actions::read_action_output(app, root, action_name)
}
