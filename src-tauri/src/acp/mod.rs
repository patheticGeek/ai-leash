mod discovery;
mod events;
mod permissions;
mod process;

use crate::chat::{self, ChatMessage};
use crate::commands;
use crate::provider::ProviderConfig;
use crate::state::AppState;
use agent_client_protocol::schema::v1::{
    ClientCapabilities, InitializeRequest, NewSessionRequest, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SessionNotification,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{AcpAgent, Agent, Client, ConnectionTo};
use std::str::FromStr;
use tauri::{AppHandle, Manager, State};

// `pub(crate)`, not `pub use`: `state.rs` and `tools/sub_agent_tools.rs`
// reference this by its `crate::acp::AcpCommand` path directly, same
// reasoning as the `tools::permissions`/`tools::shell_tools` re-exports in
// `tools/mod.rs` — a plain re-export is enough here since, unlike those,
// nothing needs to name `AcpCommand` through `generate_handler!`.
use process::ensure_acp_session;
pub(crate) use process::AcpCommand;

use discovery::{find_model_config_option, format_acp_error, model_options_payload};

/// Connects an ACP agent's subprocess ahead of the user's first message,
/// rather than waiting for `send_prompt_acp` to do it lazily — called once
/// an ACP agent becomes active for a conversation (see `ChatPanel.tsx`).
/// This is what lets a `session/load` resume failure (see `process.rs`'s
/// `drive_acp_connection`) surface to the user before there's a typed
/// message it could otherwise strand: `send_prompt_acp` clears the input as
/// soon as it's called, so a failure discovered only on first send would
/// have nowhere to put that text back.
#[tauri::command]
pub async fn warm_acp_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    launch_command: String,
    provider: ProviderConfig,
    model: String,
) -> Result<(), String> {
    ensure_acp_session(&app, &state, &session_id, &launch_command, provider, model);
    Ok(())
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
    sender
        .send(AcpCommand::Prompt(message.clone()))
        .map_err(|_| {
            "ACP agent process is no longer running; send another message to restart it."
                .to_string()
        })?;
    // Persist at command acceptance time so title lookup and transcript
    // updates do not race the ACP worker's asynchronous prompt handling.
    chat::push_message(
        &state,
        &session_id,
        ChatMessage {
            role: "user".into(),
            content: message,
            tool_calls: None,
        },
    );
    Ok(())
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
