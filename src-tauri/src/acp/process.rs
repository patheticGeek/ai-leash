use super::discovery::{
    find_model_config_option, format_acp_error, mcp_servers_for, model_options_payload,
};
use super::events::handle_session_notification;
use super::permissions::bridge_acp_permission;
use crate::chat::{self, ChatMessage};
use crate::commands;
use crate::db;
use crate::provider::ProviderConfig;
use crate::state::{AcpSession, AppState};
use agent_client_protocol::schema::v1::{
    CancelNotification, ClientCapabilities, ContentBlock, InitializeRequest, NewSessionRequest,
    PromptRequest, RequestPermissionRequest, RequestPermissionResponse, SessionConfigId,
    SessionNotification, SetSessionConfigOptionRequest, TextContent,
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
pub(crate) enum AcpCommand {
    Prompt(String),
    Cancel,
    /// Sets the agent's "model" session config option, if it exposes one
    /// (see `find_model_config_option`) — a no-op (with a surfaced error) if
    /// it doesn't. `String` is the `SessionConfigValueId` to select, as
    /// offered in the `chat://{session_id}/acp_model_options` event.
    SetModel(String),
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
pub(super) fn ensure_acp_session(
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
