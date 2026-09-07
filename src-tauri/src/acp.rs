use crate::chat::{self, ChatMessage};
use crate::commands;
use crate::state::AppState;
use crate::tools;
use agent_client_protocol::schema::v1::{
    CancelNotification, ClientCapabilities, ContentBlock, InitializeRequest, NewSessionRequest,
    PermissionOption, PermissionOptionId, PermissionOptionKind, PromptRequest,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionNotification, SessionUpdate, TextContent, ToolCall,
    ToolCallContent, ToolCallStatus, ToolCallUpdate,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{Agent, AcpAgent, Client, ConnectionTo};
use serde_json::json;
use std::str::FromStr;
use std::sync::{Arc, Mutex as StdMutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;

/// Sent from Tauri-command call sites into a running ACP connection actor
/// (`run_acp_session`) over its per-session channel.
pub enum AcpCommand {
    Prompt(String),
    Cancel,
}

#[tauri::command]
pub async fn send_prompt_acp(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    launch_command: String,
    message: String,
) -> Result<(), String> {
    let sender = ensure_acp_session(&app, &state, &session_id, &launch_command);
    sender.send(AcpCommand::Prompt(message)).map_err(|_| {
        "ACP agent process is no longer running; send another message to restart it.".to_string()
    })
}

/// Holds `state.acp_sessions`'s lock across the whole check-then-insert (no
/// `.await` in between) so two concurrent calls for the same session can't
/// double-spawn a subprocess.
fn ensure_acp_session(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    launch_command: &str,
) -> mpsc::UnboundedSender<AcpCommand> {
    let mut sessions = state.acp_sessions.lock().unwrap();
    if let Some(sender) = sessions.get(session_id) {
        return sender.clone();
    }
    let (tx, rx) = mpsc::unbounded_channel::<AcpCommand>();
    sessions.insert(session_id.to_string(), tx.clone());
    drop(sessions);

    tokio::spawn(run_acp_session(
        app.clone(),
        session_id.to_string(),
        launch_command.to_string(),
        rx,
    ));
    tx
}

async fn run_acp_session(
    app: AppHandle,
    session_id: String,
    launch_command: String,
    mut commands: mpsc::UnboundedReceiver<AcpCommand>,
) {
    let root = {
        let state = app.state::<AppState>();
        match commands::get_root_path(state.inner()) {
            Ok(r) => r,
            Err(e) => {
                let _ = app.emit(&format!("chat://{session_id}/error"), format!("ACP: {e}"));
                app.state::<AppState>().acp_sessions.lock().unwrap().remove(&session_id);
                return;
            }
        }
    };

    let agent = match AcpAgent::from_str(&launch_command) {
        Ok(a) => a,
        Err(e) => {
            let _ = app.emit(
                &format!("chat://{session_id}/error"),
                format!("Failed to parse ACP launch command: {}", format_acp_error(&e)),
            );
            app.state::<AppState>().acp_sessions.lock().unwrap().remove(&session_id);
            return;
        }
    };

    if let Err(e) =
        drive_acp_connection(app.clone(), session_id.clone(), root, agent, &mut commands).await
    {
        let _ = app.emit(
            &format!("chat://{session_id}/error"),
            format!("ACP agent exited: {}", format_acp_error(&e)),
        );
    }

    app.state::<AppState>().acp_sessions.lock().unwrap().remove(&session_id);
}

async fn drive_acp_connection(
    app: AppHandle,
    session_id: String,
    cwd: std::path::PathBuf,
    agent: AcpAgent,
    commands: &mut mpsc::UnboundedReceiver<AcpCommand>,
) -> Result<(), agent_client_protocol::Error> {
    // Shared between the notification handler (which streams AgentMessageChunk
    // text as it arrives) and the prompt loop below (which reads the
    // accumulated result back out once PromptRequest resolves, to persist it
    // via `push_message`) — there's no other way to recover "the final
    // assistant text" for a turn since we never run our own model-turn loop
    // for ACP sessions.
    let turn_text: Arc<StdMutex<String>> = Arc::new(StdMutex::new(String::new()));

    let notif_app = app.clone();
    let notif_session_id = session_id.clone();
    let notif_turn_text = turn_text.clone();
    let perm_app = app.clone();

    Client
        .builder()
        .on_receive_notification(
            async move |notification: SessionNotification, _cx| {
                handle_session_notification(
                    &notif_app,
                    &notif_session_id,
                    &notif_turn_text,
                    notification.update,
                );
                Ok(())
            },
            agent_client_protocol::on_receive_notification!(),
        )
        .on_receive_request(
            async move |request: RequestPermissionRequest, responder, _cx| {
                let outcome = bridge_acp_permission(&perm_app, &request).await;
                responder.respond(RequestPermissionResponse::new(outcome))
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(agent, async move |connection: ConnectionTo<Agent>| {
            connection
                .send_request(
                    InitializeRequest::new(ProtocolVersion::V1)
                        .client_capabilities(ClientCapabilities::new()),
                )
                .block_task()
                .await?;

            let new_session = connection
                .send_request(NewSessionRequest::new(cwd))
                .block_task()
                .await?;
            let acp_session_id = new_session.session_id;

            while let Some(cmd) = commands.recv().await {
                match cmd {
                    AcpCommand::Prompt(text) => {
                        turn_text.lock().unwrap().clear();
                        let _ = app.emit(
                            &format!("chat://{session_id}/generating"),
                            json!({ "active": true, "autonomous": false }),
                        );

                        // Persist the user's turn immediately, mirroring
                        // send_prompt's behavior, so the transcript stays
                        // complete even if the agent never replies.
                        {
                            let state = app.state::<AppState>();
                            chat::push_message(
                                &state,
                                &session_id,
                                ChatMessage {
                                    role: "user".into(),
                                    content: text.clone(),
                                    tool_calls: None,
                                },
                            );
                        }

                        let result = connection
                            .send_request(PromptRequest::new(
                                acp_session_id.clone(),
                                vec![ContentBlock::Text(TextContent::new(text))],
                            ))
                            .block_task()
                            .await;

                        let _ = app.emit(
                            &format!("chat://{session_id}/generating"),
                            json!({ "active": false, "autonomous": false }),
                        );

                        match result {
                            Ok(_response) => {
                                let final_text = turn_text.lock().unwrap().clone();
                                if !final_text.is_empty() {
                                    let state = app.state::<AppState>();
                                    chat::push_message(
                                        &state,
                                        &session_id,
                                        ChatMessage {
                                            role: "assistant".into(),
                                            content: final_text,
                                            tool_calls: None,
                                        },
                                    );
                                }
                                let _ = app.emit(&format!("chat://{session_id}/done"), ());
                            }
                            Err(e) => {
                                let _ = app.emit(
                                    &format!("chat://{session_id}/error"),
                                    format_acp_error(&e),
                                );
                            }
                        }
                    }
                    AcpCommand::Cancel => {
                        let _ = connection
                            .send_notification(CancelNotification::new(acp_session_id.clone()));
                    }
                }
            }

            Ok(())
        })
        .await
}

fn handle_session_notification(
    app: &AppHandle,
    session_id: &str,
    turn_text: &Arc<StdMutex<String>>,
    update: SessionUpdate,
) {
    match update {
        SessionUpdate::AgentMessageChunk(chunk) => {
            if let ContentBlock::Text(text) = chunk.content {
                turn_text.lock().unwrap().push_str(&text.text);
                let _ = app.emit(&format!("chat://{session_id}/chunk"), &text.text);
            }
        }
        SessionUpdate::AgentThoughtChunk(chunk) => {
            if let ContentBlock::Text(text) = chunk.content {
                let _ = app.emit(&format!("chat://{session_id}/thinking"), &text.text);
            }
        }
        SessionUpdate::ToolCall(tool_call) => emit_tool_call(app, session_id, &tool_call),
        SessionUpdate::ToolCallUpdate(update) => emit_tool_call_update(app, session_id, &update),
        // UserMessageChunk is just an echo of what we already persisted
        // before sending the prompt; Plan/AvailableCommandsUpdate/
        // CurrentModeUpdate/ConfigOptionUpdate/SessionInfoUpdate/UsageUpdate
        // and anything else are out of scope for this phase.
        _ => {}
    }
}

fn emit_tool_call(app: &AppHandle, session_id: &str, tool_call: &ToolCall) {
    let _ = app.emit(
        &format!("chat://{session_id}/tool_call"),
        json!({
            "id": tool_call.tool_call_id.to_string(),
            "name": tool_call.title,
            "arguments": tool_call.raw_input,
        }),
    );
    if matches!(tool_call.status, ToolCallStatus::Completed | ToolCallStatus::Failed) {
        let _ = app.emit(
            &format!("chat://{session_id}/tool_result"),
            json!({
                "id": tool_call.tool_call_id.to_string(),
                "result": summarize_tool_call_content(&tool_call.content),
            }),
        );
    }
}

fn emit_tool_call_update(app: &AppHandle, session_id: &str, update: &ToolCallUpdate) {
    let is_terminal = matches!(
        update.fields.status,
        Some(ToolCallStatus::Completed) | Some(ToolCallStatus::Failed)
    );
    if !is_terminal {
        return;
    }
    let content = update.fields.content.clone().unwrap_or_default();
    let _ = app.emit(
        &format!("chat://{session_id}/tool_result"),
        json!({
            "id": update.tool_call_id.to_string(),
            "result": summarize_tool_call_content(&content),
        }),
    );
}

fn summarize_tool_call_content(content: &[ToolCallContent]) -> String {
    let parts: Vec<String> = content
        .iter()
        .map(|item| match item {
            ToolCallContent::Content(c) => match &c.content {
                ContentBlock::Text(t) => t.text.clone(),
                _ => "[non-text content]".to_string(),
            },
            ToolCallContent::Diff(d) => format!("Modified {}", d.path.display()),
            ToolCallContent::Terminal(_) => "[terminal output not shown]".to_string(),
            _ => "[unsupported content]".to_string(),
        })
        .collect();
    if parts.is_empty() {
        "(no output)".to_string()
    } else {
        parts.join("\n")
    }
}

async fn bridge_acp_permission(
    app: &AppHandle,
    request: &RequestPermissionRequest,
) -> RequestPermissionOutcome {
    let title = request
        .tool_call
        .fields
        .title
        .clone()
        .unwrap_or_else(|| "ACP tool call".to_string());
    let content = request.tool_call.fields.content.clone().unwrap_or_default();
    let detail = summarize_tool_call_content(&content);

    let state = app.state::<AppState>();
    let approved = tools::request_permission(app, &state, "acp", title, detail).await;

    match select_permission_option(&request.options, approved) {
        Some(option_id) => {
            RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(option_id))
        }
        None => RequestPermissionOutcome::Cancelled,
    }
}

/// Collapses ACP's multi-option permission request down to our existing
/// boolean approve/deny UI. Approve prefers `AllowOnce`, falls back to
/// `AllowAlways`, and — if the agent offers no Allow* option at all — falls
/// back to the first option offered. Deny always maps to `None` (the caller
/// turns that into `RequestPermissionOutcome::Cancelled`, a legitimate
/// protocol response), regardless of what options were offered.
fn select_permission_option(options: &[PermissionOption], approved: bool) -> Option<PermissionOptionId> {
    if !approved {
        return None;
    }
    options
        .iter()
        .find(|o| o.kind == PermissionOptionKind::AllowOnce)
        .or_else(|| options.iter().find(|o| o.kind == PermissionOptionKind::AllowAlways))
        .or_else(|| options.first())
        .map(|o| o.option_id.clone())
}

fn format_acp_error(error: &agent_client_protocol::Error) -> String {
    match &error.data {
        Some(serde_json::Value::String(s)) => format!("{}: {s}", error.message),
        Some(other) => format!("{}: {other}", error.message),
        None => error.message.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn option(id: &str, kind: PermissionOptionKind) -> PermissionOption {
        PermissionOption::new(id.to_string(), id.to_string(), kind)
    }

    #[test]
    fn prefers_allow_once_when_approved() {
        let options = vec![
            option("allow-always", PermissionOptionKind::AllowAlways),
            option("allow-once", PermissionOptionKind::AllowOnce),
        ];
        let picked = select_permission_option(&options, true).unwrap();
        assert_eq!(picked.to_string(), "allow-once");
    }

    #[test]
    fn falls_back_to_allow_always_when_no_allow_once() {
        let options = vec![option("allow-always", PermissionOptionKind::AllowAlways)];
        let picked = select_permission_option(&options, true).unwrap();
        assert_eq!(picked.to_string(), "allow-always");
    }

    #[test]
    fn falls_back_to_first_option_when_no_allow_kind_offered() {
        let options = vec![option("reject-once", PermissionOptionKind::RejectOnce)];
        let picked = select_permission_option(&options, true).unwrap();
        assert_eq!(picked.to_string(), "reject-once");
    }

    #[test]
    fn deny_always_maps_to_none() {
        let options = vec![option("allow-once", PermissionOptionKind::AllowOnce)];
        assert!(select_permission_option(&options, false).is_none());
    }

    #[test]
    fn summarizes_mixed_tool_call_content() {
        let content = vec![ToolCallContent::Content(
            agent_client_protocol::schema::v1::Content::new(ContentBlock::Text(TextContent::new(
                "hello",
            ))),
        )];
        assert_eq!(summarize_tool_call_content(&content), "hello");
        assert_eq!(summarize_tool_call_content(&[]), "(no output)");
    }

    #[test]
    fn formats_error_with_string_data() {
        let err = agent_client_protocol::Error::new(-32000, "Internal error")
            .data(serde_json::Value::String("Process exited with 1: boom".to_string()));
        assert_eq!(format_acp_error(&err), "Internal error: Process exited with 1: boom");
    }

    #[test]
    fn formats_error_without_data() {
        let err = agent_client_protocol::Error::new(-32000, "Internal error");
        assert_eq!(format_acp_error(&err), "Internal error");
    }
}
