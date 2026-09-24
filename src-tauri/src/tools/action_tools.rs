use super::request_permission;
use crate::actions;
use crate::state::AppState;
use serde_json::{json, Value};
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
    actions::create_action_tool(app, root, action_name, command)
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
    let since = args.get("since").and_then(|v| v.as_u64());
    actions::read_action_output(app, root, action_name, since)
}

/// The native/bridge-shared definitions of every Action tool, in
/// `{name, description, parameters}` form (see `sub_agent_tools`'s `*_def`
/// functions for the same convention) — `schema.rs` wraps each as an
/// OpenAI-style function tool and `mcp_bridge::client` renames `parameters`
/// to MCP's `inputSchema`.
pub(crate) fn action_defs() -> Vec<Value> {
    vec![
        json!({
            "name": "create_action",
            "description": "Define a new Action: a named background terminal command (e.g. \"dev\" -> \"npm run dev\"), shown in the project's Actions tab and runnable via run_action. Asks the user to approve the command first, same as write_file/edit_file. Use it when a command is long-running or recurring and no existing Action covers it (check list_actions first), instead of running it via `shell` or leaving an untracked background process.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Short human-readable name, e.g. \"dev\"" },
                    "command": { "type": "string", "description": "The shell command to run in the background, e.g. \"npm run dev\"" }
                },
                "required": ["name", "command"]
            }
        }),
        json!({
            "name": "run_action",
            "description": "Start a user-defined background Action by name (see the project's Actions tab, or call list_actions). No permission prompt — the command was already vetted by the user when they defined it. A no-op if it's already running; use stop_action first if you need to restart it. Prefer this over `shell` for anything long-running or repeated (dev server, watcher, build --watch) — `shell` times out after 30 seconds. Afterwards, call read_action to confirm it started cleanly.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "The Action's name, as shown by list_actions" }
                },
                "required": ["name"]
            }
        }),
        json!({
            "name": "stop_action",
            "description": "Stop a running Action by name. A no-op if it isn't running.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "The Action's name, as shown by list_actions" }
                },
                "required": ["name"]
            }
        }),
        json!({
            "name": "list_actions",
            "description": "List this project's defined Actions and whether each is currently running. Call this before starting any dev server, watcher or other long-running command, in case an Action for it already exists.",
            "parameters": { "type": "object", "properties": {}, "required": [] }
        }),
        json!({
            "name": "read_action",
            "description": "Read an Action's status (running, stopped, or exited with its exit code) and captured output — works for a running Action and after it has stopped or exited, e.g. to check a dev server's compile output or why a build failed. Call this after run_action, or whenever a running Action might have failed, instead of guessing. The header gives byte offsets; pass `since` from a previous read to get only newer output.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "The Action's name, as shown by list_actions" },
                    "since": { "type": "integer", "description": "Optional byte offset from a previous read_action's header; returns only output after it" }
                },
                "required": ["name"]
            }
        }),
    ]
}

#[cfg(test)]
mod tests {
    use super::action_defs;

    #[test]
    fn action_defs_cover_every_action_tool() {
        let names: Vec<String> = action_defs()
            .iter()
            .map(|d| d["name"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(
            names,
            [
                "create_action",
                "run_action",
                "stop_action",
                "list_actions",
                "read_action"
            ]
        );
    }
}
