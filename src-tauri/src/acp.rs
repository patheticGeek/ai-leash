use crate::chat::{self, ChatMessage};
use crate::commands;
use crate::db;
use crate::mcp_bridge;
use crate::provider::ProviderConfig;
use crate::state::{AcpSession, AppState};
use crate::tools;
use agent_client_protocol::schema::v1::{
    AvailableCommand, AvailableCommandInput, CancelNotification, ClientCapabilities, ContentBlock,
    EnvVariable, InitializeRequest, McpServer, McpServerStdio, NewSessionRequest, PermissionOption,
    PermissionOptionId, PermissionOptionKind, PromptRequest, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome,
    SessionConfigId, SessionConfigKind, SessionConfigOption, SessionConfigOptionCategory,
    SessionConfigSelectOptions, SessionNotification, SessionUpdate, SetSessionConfigOptionRequest,
    TextContent, ToolCall, ToolCallContent, ToolCallStatus, ToolCallUpdate,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{AcpAgent, Agent, Client, ConnectionTo};
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
    provider: ProviderConfig,
    model: String,
    message: String,
) -> Result<(), String> {
    let sender = ensure_acp_session(&app, &state, &session_id, &launch_command, provider, model);
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
                responder.respond(RequestPermissionResponse::new(
                    RequestPermissionOutcome::Cancelled,
                ))
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
                .send_request(NewSessionRequest::new(root))
                .block_task()
                .await?;
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
    provider: ProviderConfig,
    model: String,
) -> mpsc::UnboundedSender<AcpCommand> {
    let mut sessions = state.acp_sessions.lock().unwrap();
    if let Some(existing) = sessions.get_mut(session_id) {
        if existing.launch_command == launch_command {
            existing.provider = provider;
            existing.model = model;
            return existing.sender.clone();
        }
        sessions.remove(session_id);
    }
    let (tx, rx) = mpsc::unbounded_channel::<AcpCommand>();
    sessions.insert(
        session_id.to_string(),
        AcpSession {
            launch_command: launch_command.to_string(),
            sender: tx.clone(),
            provider,
            model,
        },
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
    if sessions
        .get(session_id)
        .is_some_and(|s| s.launch_command == launch_command)
    {
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
                format!(
                    "Failed to parse ACP launch command: {}",
                    format_acp_error(&e)
                ),
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
    // Row id of the in-progress assistant reply, created lazily by
    // `handle_session_notification` on the first text chunk of a turn (not
    // upfront) so a turn that only makes tool calls, with no reply text at
    // all, never leaves a stray empty message behind — see its call site
    // below for why this mirrors `chat::start_streaming_assistant_message`
    // rather than reusing it directly.
    let assistant_message_id: Arc<StdMutex<Option<i64>>> = Arc::new(StdMutex::new(None));

    let notif_app = app.clone();
    let notif_session_id = session_id.clone();
    let notif_turn_text = turn_text.clone();
    let notif_message_id = assistant_message_id.clone();
    let perm_app = app.clone();
    let perm_session_id = session_id.clone();

    Client
        .builder()
        .on_receive_notification(
            async move |notification: SessionNotification, _cx| {
                handle_session_notification(
                    &notif_app,
                    &notif_session_id,
                    &notif_turn_text,
                    &notif_message_id,
                    notification.update,
                );
                Ok(())
            },
            agent_client_protocol::on_receive_notification!(),
        )
        .on_receive_request(
            async move |request: RequestPermissionRequest, responder, _cx| {
                let outcome = bridge_acp_permission(&perm_app, &perm_session_id, &request).await;
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

            let mcp_servers = mcp_servers_for(&app, &session_id, &cwd);
            let new_session = connection
                .send_request(NewSessionRequest::new(cwd).mcp_servers(mcp_servers))
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
                        *assistant_message_id.lock().unwrap() = None;
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
                                    // Content was already kept current on
                                    // disk chunk-by-chunk (see
                                    // `handle_session_notification`) — this
                                    // is only reached with `id: None` if
                                    // every prior flush failed to resolve a
                                    // project root, in which case falling
                                    // back to a plain insert is the best we
                                    // can do.
                                    match *assistant_message_id.lock().unwrap() {
                                        Some(id) => {
                                            db::finish_streaming_message(
                                                &state.db,
                                                id,
                                                &final_text,
                                                &None,
                                            );
                                            chat::remember_in_memory(
                                                &state,
                                                &session_id,
                                                ChatMessage {
                                                    role: "assistant".into(),
                                                    content: final_text,
                                                    tool_calls: None,
                                                },
                                            );
                                        }
                                        None => chat::push_message(
                                            &state,
                                            &session_id,
                                            ChatMessage {
                                                role: "assistant".into(),
                                                content: final_text,
                                                tool_calls: None,
                                            },
                                        ),
                                    }
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
                                if let Some(option) = find_model_config_option(&resp.config_options)
                                {
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

/// Attaches AI Leash's own MCP bridge (see `mcp_bridge`) to a new ACP
/// session so it can delegate sub-agents and read/write memory notes —
/// empty if the bridge hasn't finished binding yet (`lib.rs`'s `.setup()`
/// hook) or `current_exe()` fails, in which case the session just proceeds
/// without those tools rather than failing to connect at all.
fn mcp_servers_for(app: &AppHandle, session_id: &str, root: &std::path::Path) -> Vec<McpServer> {
    let Some(bridge) = app.state::<AppState>().mcp_bridge.lock().unwrap().clone() else {
        return Vec::new();
    };
    let Ok(exe) = std::env::current_exe() else {
        return Vec::new();
    };
    vec![McpServer::Stdio(
        McpServerStdio::new("ai-leash", exe)
            .args(vec!["--mcp-bridge".to_string()])
            .env(vec![
                EnvVariable::new(mcp_bridge::PORT_ENV, bridge.port.to_string()),
                EnvVariable::new(mcp_bridge::TOKEN_ENV, bridge.token),
                EnvVariable::new(mcp_bridge::SESSION_ID_ENV, session_id.to_string()),
                EnvVariable::new(mcp_bridge::PROJECT_ROOT_ENV, root.display().to_string()),
            ]),
    )]
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

/// An agent can (re-)announce its slash commands at any point in a session
/// (typically once, right after `NewSessionRequest`, but nothing stops it
/// from changing the set mid-conversation — e.g. after `cd`-ing elsewhere),
/// which is why this rebuilds and re-emits the whole list rather than
/// diffing against a previous one. `input`'s `hint` (when present) is the
/// only shape ACP defines today — "all text typed after the command name is
/// passed through as-is" — so there's nothing structured to expose beyond
/// the placeholder text.
fn available_commands_payload(commands: &[AvailableCommand]) -> serde_json::Value {
    let list: Vec<serde_json::Value> = commands
        .iter()
        .map(|c| {
            let hint = match &c.input {
                Some(AvailableCommandInput::Unstructured(u)) => Some(u.hint.clone()),
                // `#[non_exhaustive]` for forward compatibility with the
                // protocol — nothing else is defined today.
                Some(_) | None => None,
            };
            json!({ "name": c.name, "description": c.description, "hint": hint })
        })
        .collect();
    json!(list)
}

fn handle_session_notification(
    app: &AppHandle,
    session_id: &str,
    turn_text: &Arc<StdMutex<String>>,
    assistant_message_id: &Arc<StdMutex<Option<i64>>>,
    update: SessionUpdate,
) {
    match update {
        SessionUpdate::AgentMessageChunk(chunk) => {
            if let ContentBlock::Text(text) = chunk.content {
                let accumulated = {
                    let mut turn_text = turn_text.lock().unwrap();
                    turn_text.push_str(&text.text);
                    turn_text.clone()
                };
                let _ = app.emit(&format!("chat://{session_id}/chunk"), &text.text);

                // Reserve the row on the first chunk of a turn (rather than
                // upfront in `drive_acp_connection`) so a turn that only
                // makes tool calls never leaves a stray empty message behind
                // — see the doc comment where `assistant_message_id` is
                // declared. Every chunk after that just overwrites it.
                let state = app.state::<AppState>();
                let mut id_slot = assistant_message_id.lock().unwrap();
                if id_slot.is_none() {
                    *id_slot = chat::start_streaming_assistant_message(&state, session_id);
                }
                if let Some(id) = *id_slot {
                    db::update_streaming_message(&state.db, id, &accumulated);
                }
            }
        }
        SessionUpdate::AgentThoughtChunk(chunk) => {
            if let ContentBlock::Text(text) = chunk.content {
                let _ = app.emit(&format!("chat://{session_id}/thinking"), &text.text);
            }
        }
        SessionUpdate::ToolCall(tool_call) => emit_tool_call(app, session_id, &tool_call),
        SessionUpdate::ToolCallUpdate(update) => emit_tool_call_update(app, session_id, &update),
        SessionUpdate::AvailableCommandsUpdate(update) => {
            let _ = app.emit(
                &format!("chat://{session_id}/acp_commands"),
                available_commands_payload(&update.available_commands),
            );
        }
        // UserMessageChunk is just an echo of what we already persisted
        // before sending the prompt; Plan/CurrentModeUpdate/ConfigOptionUpdate/
        // SessionInfoUpdate/UsageUpdate and anything else are out of scope
        // for this phase.
        _ => {}
    }
}

fn emit_tool_call(app: &AppHandle, session_id: &str, tool_call: &ToolCall) {
    let call_id = tool_call.tool_call_id.to_string();
    let _ = app.emit(
        &format!("chat://{session_id}/tool_call"),
        json!({
            "id": &call_id,
            "name": tool_call.title,
            "arguments": tool_call.raw_input,
        }),
    );
    persist_tool_call(
        app,
        session_id,
        &call_id,
        &tool_call.title,
        &tool_call.raw_input,
    );
    if matches!(
        tool_call.status,
        ToolCallStatus::Completed | ToolCallStatus::Failed
    ) {
        let result = summarize_tool_call_content(&tool_call.content);
        let _ = app.emit(
            &format!("chat://{session_id}/tool_result"),
            json!({ "id": &call_id, "result": &result }),
        );
        persist_tool_result(app, session_id, &result);
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
    let result = summarize_tool_call_content(&content);
    let _ = app.emit(
        &format!("chat://{session_id}/tool_result"),
        json!({ "id": update.tool_call_id.to_string(), "result": &result }),
    );
    // No matching `persist_tool_call` here — a `ToolCallUpdate` always
    // follows a `ToolCall` for the same id (this is just it reaching a
    // terminal state), and that already persisted the assistant/tool_calls
    // half via `emit_tool_call` above.
    persist_tool_result(app, session_id, &result);
}

/// Persists the "assistant announced this tool call" half as a real
/// `ChatMessage` — same shape `messagesToEntries` (`chatEntries.ts`) already
/// reconstructs tool entries from for the built-in loop, so ACP tool calls
/// survive an app restart too instead of only ever being forwarded live.
/// Empty `content` here matches how a tool-calls-only assistant turn is
/// represented elsewhere (e.g. `resume_after_background_subtask` in
/// `chat.rs`).
fn persist_tool_call(
    app: &AppHandle,
    session_id: &str,
    call_id: &str,
    name: &str,
    raw_input: &Option<serde_json::Value>,
) {
    let state = app.state::<AppState>();
    chat::push_message(
        &state,
        session_id,
        ChatMessage {
            role: "assistant".into(),
            content: String::new(),
            tool_calls: Some(vec![tools::ToolCall {
                id: Some(call_id.to_string()),
                function: tools::ToolCallFunction {
                    name: name.to_string(),
                    arguments: raw_input.clone().unwrap_or(serde_json::Value::Null),
                },
            }]),
        },
    );
}

/// The other half of a persisted tool call — see `persist_tool_call`.
fn persist_tool_result(app: &AppHandle, session_id: &str, result: &str) {
    let state = app.state::<AppState>();
    chat::push_message(
        &state,
        session_id,
        ChatMessage {
            role: "tool".into(),
            content: result.to_string(),
            tool_calls: None,
        },
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
    session_id: &str,
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
    let approved = tools::request_permission(app, &state, session_id, "acp", title, detail).await;

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
fn select_permission_option(
    options: &[PermissionOption],
    approved: bool,
) -> Option<PermissionOptionId> {
    if !approved {
        return None;
    }
    options
        .iter()
        .find(|o| o.kind == PermissionOptionKind::AllowOnce)
        .or_else(|| {
            options
                .iter()
                .find(|o| o.kind == PermissionOptionKind::AllowAlways)
        })
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
    fn available_commands_payload_flattens_hint_and_omits_it_when_absent() {
        use agent_client_protocol::schema::v1::UnstructuredCommandInput;

        let commands = vec![
            AvailableCommand::new("create_plan", "Draft an implementation plan").input(
                AvailableCommandInput::Unstructured(UnstructuredCommandInput::new("<goal>")),
            ),
            AvailableCommand::new("research_codebase", "Explore the codebase"),
        ];
        let payload = available_commands_payload(&commands);
        assert_eq!(
            payload,
            json!([
                { "name": "create_plan", "description": "Draft an implementation plan", "hint": "<goal>" },
                { "name": "research_codebase", "description": "Explore the codebase", "hint": null },
            ])
        );
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
        let err = agent_client_protocol::Error::new(-32000, "Internal error").data(
            serde_json::Value::String("Process exited with 1: boom".to_string()),
        );
        assert_eq!(
            format_acp_error(&err),
            "Internal error: Process exited with 1: boom"
        );
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
        let err = agent_client_protocol::Error::new(-32000, "Internal error").data(
            serde_json::Value::String("Process exited with 1: boom".to_string()),
        );
        assert!(!format_acp_error(&err).contains("couldn't be found"));
    }
}
