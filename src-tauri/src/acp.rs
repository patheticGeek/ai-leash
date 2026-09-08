use crate::chat::{self, ChatMessage};
use crate::commands;
use crate::state::{AcpSession, AppState};
use crate::tools;
use agent_client_protocol::schema::v1::{
    CancelNotification, ClientCapabilities, ContentBlock, InitializeRequest, NewSessionRequest,
    PermissionOption, PermissionOptionId, PermissionOptionKind, PromptRequest,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionConfigId, SessionConfigKind, SessionConfigOption,
    SessionConfigOptionCategory, SessionConfigSelectOptions, SessionNotification, SessionUpdate,
    SetSessionConfigOptionRequest, TextContent, ToolCall, ToolCallContent, ToolCallStatus,
    ToolCallUpdate,
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
    /// Sets the agent's "model" session config option, if it exposes one
    /// (see `find_model_config_option`) — a no-op (with a surfaced error) if
    /// it doesn't. `String` is the `SessionConfigValueId` to select, as
    /// offered in the `chat://{session_id}/acp_model_options` event.
    SetModel(String),
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

/// Only meaningful once a session is already connected (send a prompt
/// first) and only has any effect if that agent advertised a Model config
/// option — see `find_model_config_option`. Doesn't spawn a session on its
/// own since there'd be nothing to set a model on yet.
#[tauri::command]
pub async fn set_acp_model(
    state: State<'_, AppState>,
    session_id: String,
    value: String,
) -> Result<(), String> {
    let sender = {
        let sessions = state.acp_sessions.lock().unwrap();
        sessions.get(&session_id).map(|s| s.sender.clone())
    };
    let sender = sender.ok_or_else(|| {
        "ACP agent process is no longer running; send a message first to start it.".to_string()
    })?;
    sender
        .send(AcpCommand::SetModel(value))
        .map_err(|_| "ACP agent process is no longer running.".to_string())
}

/// Spawns a throwaway ACP subprocess purely to ask "what models do you
/// offer" (via the same Model config option `drive_acp_connection` checks
/// for), then lets the connection close immediately without ever sending a
/// prompt — `connect_with`'s `ChildGuard` kills the subprocess once this
/// closure returns, so there's no separate teardown step: the "fake
/// session" cleans itself up. Not registered in `AppState.acp_sessions`,
/// since it's not a real session anything else should be able to find.
/// Returns `Ok(None)` (not an error) when the agent connects fine but
/// simply doesn't expose a model option.
#[tauri::command]
pub async fn fetch_acp_models(
    app: AppHandle,
    launch_command: String,
) -> Result<Option<serde_json::Value>, String> {
    let root = {
        let state = app.state::<AppState>();
        commands::get_root_path(state.inner())?
    };
    let agent = AcpAgent::from_str(&launch_command).map_err(|e| format_acp_error(&e))?;

    Client
        .builder()
        .on_receive_notification(
            async move |_notification: SessionNotification, _cx| Ok(()),
            agent_client_protocol::on_receive_notification!(),
        )
        .on_receive_request(
            async move |_request: RequestPermissionRequest, responder, _cx| {
                // Discovery never sends a prompt, so the agent has nothing
                // to ask permission for — deny by construction rather than
                // popping up the real permission UI for a session the user
                // never asked to start.
                responder.respond(RequestPermissionResponse::new(RequestPermissionOutcome::Cancelled))
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
            let new_session = connection.send_request(NewSessionRequest::new(root)).block_task().await?;
            Ok(new_session
                .config_options
                .as_ref()
                .and_then(|opts| find_model_config_option(opts))
                .map(model_options_payload))
        })
        .await
        .map_err(|e| format_acp_error(&e))
}

/// Holds `state.acp_sessions`'s lock across the whole check-then-insert (no
/// `.await` in between) so two concurrent calls for the same session can't
/// double-spawn a subprocess.
///
/// A session_id can outlive the agent it was first spawned for — ACP agent
/// choice is per-conversation on the frontend (see `ChatPanel.tsx`'s
/// `acpActiveId`), so the same project can switch from Claude Code to
/// Copilot and back without a session_id ever changing. If the requested
/// `launch_command` doesn't match the one the currently-running subprocess
/// was started with, drop our handle to it (letting it wind down once it's
/// idle — no explicit shutdown needed, it exits when its last sender clone
/// is dropped and `commands.recv()` returns `None`) and spawn a fresh one
/// for the newly-selected agent instead of silently keeping the old
/// conversation's agent live.
fn ensure_acp_session(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    launch_command: &str,
) -> mpsc::UnboundedSender<AcpCommand> {
    let mut sessions = state.acp_sessions.lock().unwrap();
    if let Some(existing) = sessions.get(session_id) {
        if existing.launch_command == launch_command {
            return existing.sender.clone();
        }
        sessions.remove(session_id);
    }
    let (tx, rx) = mpsc::unbounded_channel::<AcpCommand>();
    sessions.insert(
        session_id.to_string(),
        AcpSession { launch_command: launch_command.to_string(), sender: tx.clone() },
    );
    drop(sessions);

    tokio::spawn(run_acp_session(
        app.clone(),
        session_id.to_string(),
        launch_command.to_string(),
        rx,
    ));
    tx
}

/// Removes this session_id's map entry only if it's still the one *this*
/// task spawned (matched by `launch_command`) — a slow-to-exit subprocess
/// finishing its cleanup after `ensure_acp_session` has already replaced it
/// with a different agent (see its doc comment) must not delete the *new*
/// entry out from under it, or the new subprocess would be silently
/// orphaned (still running, but no longer reachable via `acp_sessions`).
fn remove_if_still_current(app: &AppHandle, session_id: &str, launch_command: &str) {
    let state = app.state::<AppState>();
    let mut sessions = state.acp_sessions.lock().unwrap();
    if sessions.get(session_id).is_some_and(|s| s.launch_command == launch_command) {
        sessions.remove(session_id);
    }
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
                remove_if_still_current(&app, &session_id, &launch_command);
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
            remove_if_still_current(&app, &session_id, &launch_command);
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

    remove_if_still_current(&app, &session_id, &launch_command);
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

            // If this agent exposes a Model config option, tell the
            // frontend what's selectable; most agents won't have one, in
            // which case no event fires and the chat bar shows nothing for
            // model selection (there's nothing to select).
            let mut model_config_id: Option<SessionConfigId> = None;
            if let Some(option) = new_session
                .config_options
                .as_ref()
                .and_then(|opts| find_model_config_option(opts))
            {
                model_config_id = Some(option.id.clone());
                let _ = app.emit(
                    &format!("chat://{session_id}/acp_model_options"),
                    model_options_payload(option),
                );
            }

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
                    AcpCommand::SetModel(value) => {
                        let Some(config_id) = model_config_id.clone() else {
                            let _ = app.emit(
                                &format!("chat://{session_id}/error"),
                                "This ACP agent doesn't expose a model to select.".to_string(),
                            );
                            continue;
                        };
                        match connection
                            .send_request(SetSessionConfigOptionRequest::new(
                                acp_session_id.clone(),
                                config_id,
                                value.as_str(),
                            ))
                            .block_task()
                            .await
                        {
                            Ok(resp) => {
                                if let Some(option) = find_model_config_option(&resp.config_options) {
                                    let _ = app.emit(
                                        &format!("chat://{session_id}/acp_model_options"),
                                        model_options_payload(option),
                                    );
                                }
                            }
                            Err(e) => {
                                let _ = app.emit(
                                    &format!("chat://{session_id}/error"),
                                    format!("Failed to set model: {}", format_acp_error(&e)),
                                );
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .await
}

/// ACP lets an agent advertise a "model" selector as one of its session
/// config options, but it's agent-defined and optional — most agents won't
/// have one. When present it's always a fixed list of choices (a `Select`),
/// never freeform text, so this is the only way a model can legitimately be
/// set for an ACP-backed session; there's no separate "type any model name"
/// path because the protocol doesn't support one.
fn find_model_config_option(options: &[SessionConfigOption]) -> Option<&SessionConfigOption> {
    options.iter().find(|o| {
        matches!(o.category, Some(SessionConfigOptionCategory::Model))
            && matches!(o.kind, SessionConfigKind::Select(_))
    })
}

/// Flattens grouped options (`SessionConfigSelectOptions::Grouped`) into a
/// single list, dropping group headers — the frontend just needs a picker,
/// not nested categories.
fn model_options_payload(option: &SessionConfigOption) -> serde_json::Value {
    let SessionConfigKind::Select(select) = &option.kind else {
        return json!(null);
    };
    let flat: Vec<serde_json::Value> = match &select.options {
        SessionConfigSelectOptions::Ungrouped(opts) => opts
            .iter()
            .map(|o| json!({ "value": o.value.to_string(), "name": o.name }))
            .collect(),
        SessionConfigSelectOptions::Grouped(groups) => groups
            .iter()
            .flat_map(|g| &g.options)
            .map(|o| json!({ "value": o.value.to_string(), "name": o.name }))
            .collect(),
        // `#[non_exhaustive]` for forward compatibility with the protocol —
        // nothing else is defined today.
        _ => vec![],
    };
    json!({
        "id": option.id.to_string(),
        "name": option.name,
        "currentValue": select.current_value.to_string(),
        "options": flat,
    })
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
    let base = match &error.data {
        Some(serde_json::Value::String(s)) => format!("{}: {s}", error.message),
        Some(other) => format!("{}: {other}", error.message),
        None => error.message.clone(),
    };
    // The crate reports a failed spawn (bad command, or the binary genuinely
    // isn't reachable) as an opaque OS error buried in `data`, indistinguishable
    // from any other internal error at a glance. `os error 2` is ENOENT — the
    // executable itself couldn't be found, which is almost always either a
    // typo in the launch command or a PATH problem (npx/copilot installed via
    // something like nvm that only exposes it to interactive shells, which is
    // why `env::fix_path_env` exists — but it can't help if the command is
    // simply wrong).
    if base.contains("os error 2") || base.contains("No such file or directory") {
        format!(
            "{base}\n\nThe agent's launch command couldn't be found. Check for a typo, that it's \
             installed, and that it's on PATH — or use its full path instead of relying on PATH \
             lookup (Settings → Agent backend)."
        )
    } else {
        base
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

    #[test]
    fn appends_a_hint_for_a_failed_spawn() {
        let err = agent_client_protocol::Error::new(-32000, "Internal error").data(
            serde_json::json!({"spawned_at": "jsonrpc.rs:1931:39", "data": "No such file or directory (os error 2)"}),
        );
        let formatted = format_acp_error(&err);
        assert!(formatted.contains("No such file or directory (os error 2)"));
        assert!(formatted.contains("couldn't be found"));
    }

    #[test]
    fn does_not_hint_for_an_unrelated_error() {
        let err = agent_client_protocol::Error::new(-32000, "Internal error")
            .data(serde_json::Value::String("Process exited with 1: boom".to_string()));
        assert!(!format_acp_error(&err).contains("couldn't be found"));
    }
}
