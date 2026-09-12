use super::discovery::{
    find_model_config_option, find_thought_level_config_option, format_acp_error, mcp_servers_for,
    model_options_payload, thought_level_options_payload,
};
use super::events::{
    close_segment, handle_session_notification, CurrentSegment, PendingToolCallContent,
    SuppressReplay,
};
use super::permissions::bridge_acp_permission;
use crate::commands;
use crate::db;
use crate::provider::ProviderConfig;
use crate::state::{AcpSession, AppState};
use agent_client_protocol::schema::v1::{
    CancelNotification, ClientCapabilities, ContentBlock, InitializeRequest, LoadSessionRequest,
    NewSessionRequest, PromptRequest, RequestPermissionRequest, RequestPermissionResponse,
    SessionConfigId, SessionConfigOption, SessionId, SessionNotification,
    SetSessionConfigOptionRequest, TextContent,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{AcpAgent, Agent, Client, ConnectionTo};
use serde_json::json;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
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
    /// Sets the agent's "thought level" session config option, if it exposes
    /// one (see `find_thought_level_config_option`).
    SetEffort(String),
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
            let sender = existing.sender.clone();
            // Re-announce this connection's cached config to whatever just
            // (re)subscribed — see `AcpSession::model_options`'s doc comment.
            if let Some(payload) = existing.model_options.clone() {
                let _ = app.emit(&format!("chat://{session_id}/acp_model_options"), payload);
            }
            if let Some(payload) = existing.effort_options.clone() {
                let _ = app.emit(&format!("chat://{session_id}/acp_effort_options"), payload);
            }
            if let Some(payload) = existing.available_commands.clone() {
                let _ = app.emit(&format!("chat://{session_id}/acp_commands"), payload);
            }
            return sender;
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
            model_options: None,
            effort_options: None,
            available_commands: None,
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

/// Caches a just-emitted `acp_model_options`/`acp_effort_options`/
/// `acp_commands` payload onto this session's `AcpSession` entry, if it's
/// still live — see that struct's doc comment on why (re-emitting it later
/// when `ensure_acp_session` reuses this connection). A no-op if the session
/// has since been dropped/replaced, which can't happen from any of this
/// function's own call sites (they all run inside the same connection's
/// still-live task) but is possible in principle if this ever gets called
/// from elsewhere.
pub(super) fn cache_acp_config(
    app: &AppHandle,
    session_id: &str,
    update: impl FnOnce(&mut AcpSession),
) {
    if let Some(session) = app
        .state::<AppState>()
        .acp_sessions
        .lock()
        .unwrap()
        .get_mut(session_id)
    {
        update(session);
    }
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

    if let Err(e) = drive_acp_connection(
        app.clone(),
        session_id.clone(),
        launch_command.clone(),
        root,
        agent,
        &mut commands,
    )
    .await
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
    launch_command: String,
    cwd: std::path::PathBuf,
    agent: AcpAgent,
    commands: &mut mpsc::UnboundedReceiver<AcpCommand>,
) -> Result<(), agent_client_protocol::Error> {
    // Shared between the notification handler (which streams
    // AgentMessageChunk/AgentThoughtChunk text as it arrives, one DB row per
    // contiguous run — see `CurrentSegment`'s doc comment) and the prompt
    // loop below, which closes out whatever run is still open once
    // PromptRequest resolves.
    let current_segment: CurrentSegment = Arc::new(StdMutex::new(None));
    // Tracks in-flight tool calls' most recently seen `content` across
    // `ToolCallUpdate`s for this connection — see `PendingToolCallContent`'s
    // doc comment for why a terminal update can't just trust its own
    // `content` field in isolation.
    let pending_tool_content: PendingToolCallContent = Arc::new(StdMutex::new(HashMap::new()));
    // See `SuppressReplay`'s doc comment — held true only around the
    // `LoadSessionRequest` call below, while the agent is replaying a
    // resumed session's history we already have in SQLite.
    let suppress_replay: SuppressReplay = Arc::new(AtomicBool::new(false));

    let notif_app = app.clone();
    let notif_session_id = session_id.clone();
    let notif_current_segment = current_segment.clone();
    let notif_pending_tool_content = pending_tool_content.clone();
    let notif_suppress_replay = suppress_replay.clone();
    let perm_app = app.clone();
    let perm_session_id = session_id.clone();

    Client
        .builder()
        .on_receive_notification(
            async move |notification: SessionNotification, _cx| {
                handle_session_notification(
                    &notif_app,
                    &notif_session_id,
                    &notif_current_segment,
                    &notif_pending_tool_content,
                    &notif_suppress_replay,
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
            let init_response = connection
                .send_request(
                    InitializeRequest::new(ProtocolVersion::V1)
                        .client_capabilities(ClientCapabilities::new()),
                )
                .block_task()
                .await?;

            let mcp_servers = mcp_servers_for(&app, &session_id, &cwd);

            // Only worth a lookup at all if the agent can actually resume
            // from it — an agent that never advertises `loadSession` would
            // just reject the id anyway.
            let stored_agent_session_id = if init_response.agent_capabilities.load_session {
                let state = app.state::<AppState>();
                db::get_acp_agent_session_id(&state.db, &session_id, &launch_command)
            } else {
                None
            };

            let (acp_session_id, config_options): (SessionId, Option<Vec<SessionConfigOption>>) =
                if let Some(stored_id) = stored_agent_session_id {
                    suppress_replay.store(true, Ordering::Release);
                    let load_result = connection
                        .send_request(
                            LoadSessionRequest::new(SessionId::new(stored_id.clone()), cwd)
                                .mcp_servers(mcp_servers),
                        )
                        .block_task()
                        .await;
                    suppress_replay.store(false, Ordering::Release);

                    match load_result {
                        Ok(resp) => (SessionId::new(stored_id), resp.config_options),
                        Err(e) => {
                            // The agent no longer recognizes this id (expired,
                            // or its own session store was cleared) — drop it
                            // so the next attempt (the user retrying, or just
                            // sending another message) goes straight to a
                            // fresh `session/new` instead of repeating this
                            // same failure. Told to the user rather than
                            // silently started over, since context from the
                            // prior conversation is genuinely gone from the
                            // agent's side even though our own transcript
                            // still has it.
                            let state = app.state::<AppState>();
                            db::delete_acp_agent_session_id(
                                &state.db,
                                &session_id,
                                &launch_command,
                            );
                            let _ = app.emit(
                                &format!("chat://{session_id}/acp_session_restore_failed"),
                                format_acp_error(&e),
                            );
                            return Ok(());
                        }
                    }
                } else {
                    let new_session = connection
                        .send_request(NewSessionRequest::new(cwd).mcp_servers(mcp_servers))
                        .block_task()
                        .await?;
                    let state = app.state::<AppState>();
                    db::set_acp_agent_session_id(
                        &state.db,
                        &session_id,
                        &launch_command,
                        &new_session.session_id.to_string(),
                    );
                    (new_session.session_id, new_session.config_options)
                };

            // If this agent exposes a Model config option, tell the
            // frontend what's selectable; most agents won't have one, in
            // which case no event fires and the chat bar shows nothing for
            // model selection (there's nothing to select).
            let mut model_config_id: Option<SessionConfigId> = None;
            if let Some(option) = config_options
                .as_ref()
                .and_then(|opts| find_model_config_option(opts))
            {
                model_config_id = Some(option.id.clone());
                let payload = model_options_payload(option);
                cache_acp_config(&app, &session_id, |s| {
                    s.model_options = Some(payload.clone())
                });
                let _ = app.emit(&format!("chat://{session_id}/acp_model_options"), payload);
            }
            let mut effort_config_id: Option<SessionConfigId> = None;
            if let Some(option) = config_options
                .as_ref()
                .and_then(|opts| find_thought_level_config_option(opts))
            {
                effort_config_id = Some(option.id.clone());
                let payload = thought_level_options_payload(option);
                cache_acp_config(&app, &session_id, |s| {
                    s.effort_options = Some(payload.clone())
                });
                let _ = app.emit(&format!("chat://{session_id}/acp_effort_options"), payload);
            }

            while let Some(cmd) = commands.recv().await {
                match cmd {
                    AcpCommand::Prompt(text) => {
                        *current_segment.lock().unwrap() = None;
                        let _ = app.emit(
                            &format!("chat://{session_id}/generating"),
                            json!({ "active": true, "autonomous": false }),
                        );

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
                                // Whatever run was still open (reply or
                                // thinking) is done now that the turn has
                                // resolved — close it out so its bookkeeping
                                // (see `close_segment`) isn't lost.
                                close_segment(&app, &session_id, &current_segment);
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
                                    let payload = model_options_payload(option);
                                    cache_acp_config(&app, &session_id, |s| {
                                        s.model_options = Some(payload.clone())
                                    });
                                    let _ = app.emit(
                                        &format!("chat://{session_id}/acp_model_options"),
                                        payload,
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
                    AcpCommand::SetEffort(value) => {
                        let Some(config_id) = effort_config_id.clone() else {
                            let _ = app.emit(
                                &format!("chat://{session_id}/error"),
                                "This ACP agent doesn't expose an effort level to select."
                                    .to_string(),
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
                                if let Some(option) =
                                    find_thought_level_config_option(&resp.config_options)
                                {
                                    let payload = thought_level_options_payload(option);
                                    cache_acp_config(&app, &session_id, |s| {
                                        s.effort_options = Some(payload.clone())
                                    });
                                    let _ = app.emit(
                                        &format!("chat://{session_id}/acp_effort_options"),
                                        payload,
                                    );
                                }
                            }
                            Err(e) => {
                                let _ = app.emit(
                                    &format!("chat://{session_id}/error"),
                                    format!("Failed to set effort: {}", format_acp_error(&e)),
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
