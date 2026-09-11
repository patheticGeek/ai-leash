use super::{request_permission, truncate, ToolCall, ToolCallFunction};
use crate::chat;
use crate::commands;
use crate::state::AppState;
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

pub(super) async fn shell(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    root: &Path,
    args: &Value,
) -> Result<String, String> {
    let command = args
        .get("command")
        .and_then(|v| v.as_str())
        .ok_or("missing `command`")?;
    let approved = request_permission(
        app,
        state,
        session_id,
        "shell",
        "Run shell command".into(),
        command.into(),
    )
    .await;
    if !approved {
        return Ok("The user denied permission to run this command.".into());
    }
    run_shell(command, root).await
}

async fn run_shell(command: &str, cwd: &Path) -> Result<String, String> {
    let output = tokio::time::timeout(
        Duration::from_secs(30),
        tokio::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .current_dir(cwd)
            .output(),
    )
    .await
    .map_err(|_| "command timed out after 30s".to_string())?
    .map_err(|e| e.to_string())?;

    let mut combined = String::new();
    combined.push_str(&String::from_utf8_lossy(&output.stdout));
    if !output.stderr.is_empty() {
        combined.push_str("\n[stderr]\n");
        combined.push_str(&String::from_utf8_lossy(&output.stderr));
    }
    combined.push_str(&format!(
        "\n[exit code: {}]",
        output.status.code().unwrap_or(-1)
    ));
    Ok(truncate(combined))
}

/// The `!command` chat-input escape (see `ChatPanel.tsx`'s `send()`) — runs
/// `command` the same way the agent's own `shell` tool would, but skips
/// `request_permission` entirely: the user just typed it into their own
/// chat box, which *is* the approval, the same way a real shell doesn't ask
/// "are you sure?" before running what you typed. Recorded as a real
/// assistant-tool_call/tool message pair (not a bare injected message) so
/// it renders and persists exactly like an agent-issued `shell` call — see
/// `resume_after_background_subtask` in `chat.rs`, which uses the same
/// pattern for the same reason.
#[tauri::command]
pub async fn run_shell_command(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    command: String,
) -> Result<String, String> {
    let root = commands::get_root_path(state.inner())?;
    let result = run_shell(&command, &root)
        .await
        .unwrap_or_else(|e| format!("Error: {e}"));

    let call_id = Uuid::new_v4().to_string();
    let arguments = json!({ "command": command });

    chat::push_message(
        &state,
        &session_id,
        chat::ChatMessage {
            role: "assistant".into(),
            content: String::new(),
            tool_calls: Some(vec![ToolCall {
                id: Some(call_id.clone()),
                function: ToolCallFunction {
                    name: "shell".into(),
                    arguments: arguments.clone(),
                },
            }]),
        },
    );
    let _ = app.emit(
        &format!("chat://{session_id}/tool_call"),
        json!({ "id": call_id, "name": "shell", "arguments": arguments }),
    );

    chat::push_message(
        &state,
        &session_id,
        chat::ChatMessage {
            role: "tool".into(),
            content: result.clone(),
            tool_calls: None,
        },
    );
    let _ = app.emit(
        &format!("chat://{session_id}/tool_result"),
        json!({ "id": call_id, "result": &result }),
    );

    Ok(result)
}
