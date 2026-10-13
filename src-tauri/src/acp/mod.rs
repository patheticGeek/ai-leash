mod backend;
mod discovery;
pub mod elicitation;
mod events;
mod permissions;
mod process;
pub mod rate_limit;

use crate::backend::{Backend, NativeBackend};
use crate::commands;
use crate::paths;
use crate::provider::ProviderConfig;
use crate::state::{AcpAgentCatalogEntry, AppState};
use agent_client_protocol::schema::v1::{
    ClientCapabilities, InitializeRequest, NewSessionRequest, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SessionNotification,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{AcpAgent, Agent, Client, ConnectionTo};
use std::path::PathBuf;
use std::str::FromStr;
use tauri::{AppHandle, Emitter, Manager, State};

// `pub(crate)`, not `pub use`: `state.rs` and `tools/sub_agent_tools.rs`
// reference this by its `crate::acp::AcpCommand` path directly, same
// reasoning as the `tools::permissions`/`tools::shell_tools` re-exports in
// `tools/mod.rs` — a plain re-export is enough here since, unlike those,
// nothing needs to name `AcpCommand` through `generate_handler!`.
pub(crate) use backend::AcpBackend;
pub(crate) use process::AcpCommand;
use process::AcpSessionOptions;

use discovery::{
    find_model_config_option, find_thought_level_config_option, format_acp_error,
    model_options_payload, thought_level_options_payload,
};

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
    session_id: String,
    launch_command: String,
    provider: ProviderConfig,
    model: String,
) -> Result<(), String> {
    top_level(launch_command, provider, model).warm(&app, &session_id);
    Ok(())
}

#[tauri::command]
pub async fn send_prompt_acp(
    app: AppHandle,
    session_id: String,
    launch_command: String,
    provider: ProviderConfig,
    model: String,
    message: String,
) -> Result<(), String> {
    top_level(launch_command, provider, model)
        .send(&app, &session_id, message)
        .await
}

/// A top-level conversation's agent. `provider`/`model` are the native ones
/// its sub-agents run on — see `Backend::native`.
fn top_level(launch_command: String, provider: ProviderConfig, model: String) -> AcpBackend {
    AcpBackend {
        launch_command,
        model_value: None,
        effort_value: None,
        native: NativeBackend {
            provider,
            model,
            effort: None,
        },
    }
}

/// The ACP half of `backend::cancel`: wakes `drive_acp_connection`'s
/// `tokio::select!` (`process.rs`) immediately even while a `Prompt` is in
/// flight — the command channel is only drained between commands, and a
/// `Prompt` typically occupies it for the agent's entire turn — then queues
/// a `Cancel` too. `current_prompt_cancel` is `None` whenever nothing's
/// running, so this is a no-op then.
pub(crate) fn cancel(state: &AppState, session_id: &str) {
    if let Some(session) = state.acp_sessions.lock().unwrap().get(session_id) {
        if let Some(notify) = session.current_prompt_cancel.lock().unwrap().as_ref() {
            notify.notify_one();
        }
        let _ = session.sender.send(AcpCommand::Cancel);
    }
}

/// What `session_id`'s live connection offers right now — the same snapshot
/// `acp://session-options` publishes on every change, for a view that opens
/// after the connection came up.
#[tauri::command]
pub fn get_acp_session_options(
    state: State<'_, AppState>,
    session_id: String,
) -> AcpSessionOptions {
    process::session_options(&state, &session_id)
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

#[tauri::command]
pub async fn set_acp_effort(
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
        .send(AcpCommand::SetEffort(value))
        .map_err(|_| "ACP agent process is no longer running.".to_string())
}

/// `fetch_acp_models`'s return shape — both fields independently `None` when
/// the agent connects fine but simply doesn't expose that config option.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpDiscoveredOptions {
    pub model: Option<serde_json::Value>,
    pub effort: Option<serde_json::Value>,
}

/// Spawns a throwaway ACP subprocess purely to ask "what models/effort
/// levels do you offer" (via the same Model/ThoughtLevel config options
/// `drive_acp_connection` checks for), then lets the connection close
/// immediately without ever sending a prompt — `connect_with`'s
/// `ChildGuard` kills the subprocess once this closure returns, so there's
/// no separate teardown step: the "fake session" cleans itself up. Not
/// registered in `AppState.acp_sessions`, since it's not a real session
/// anything else should be able to find.
#[tauri::command]
pub async fn fetch_acp_models(
    app: AppHandle,
    launch_command: String,
) -> Result<AcpDiscoveredOptions, String> {
    let root = {
        let state = app.state::<AppState>();
        commands::get_root_path(state.inner())?
    };
    discover_acp_options(root, &launch_command).await
}

/// The actual "fake session" handshake, factored out of the `fetch_acp_models`
/// command so `refresh_acp_catalog_in_background` (below) can reuse it
/// without going through the Tauri IPC/command layer.
async fn discover_acp_options(
    root: PathBuf,
    launch_command: &str,
) -> Result<AcpDiscoveredOptions, String> {
    let agent = AcpAgent::from_str(launch_command).map_err(|e| format_acp_error(&e))?;

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
            let options = new_session.config_options.as_ref();
            Ok(AcpDiscoveredOptions {
                model: options
                    .and_then(|opts| find_model_config_option(opts))
                    .map(model_options_payload),
                effort: options
                    .and_then(|opts| find_thought_level_config_option(opts))
                    .map(thought_level_options_payload),
            })
        })
        .await
        .map_err(|e| format_acp_error(&e))
}

/// Replaces the whole cached ACP agent catalog wholesale — called by the
/// frontend (`acpSlice.ts`) whenever its configured agents or discovered
/// model/effort options change. See `AcpAgentCatalogEntry`'s doc comment.
#[tauri::command]
pub fn sync_acp_agent_catalog(state: State<'_, AppState>, agents: Vec<AcpAgentCatalogEntry>) {
    save_acp_catalog_to_disk(&agents);
    *state.acp_agent_catalog.lock().unwrap() = agents;
}

/// Returns the current in-memory catalog — what the frontend's
/// `useAcpAgentCatalog()` query reads, and what's populated at startup from
/// disk (see `lib.rs`'s `.setup()` hook) before any discovery has run.
#[tauri::command]
pub fn get_acp_agent_catalog(state: State<'_, AppState>) -> Vec<AcpAgentCatalogEntry> {
    state.acp_agent_catalog.lock().unwrap().clone()
}

fn acp_catalog_path() -> PathBuf {
    paths::versioned_file("acp-catalog", "json")
}

/// `unwrap_or_default()` on any read/parse failure (no file yet on a first
/// launch, corrupt file, etc.) — same idiom as `actions::load_actions`.
pub fn load_acp_catalog_from_disk() -> Vec<AcpAgentCatalogEntry> {
    std::fs::read_to_string(acp_catalog_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_acp_catalog_to_disk(entries: &[AcpAgentCatalogEntry]) {
    let path = acp_catalog_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(entries) {
        let _ = std::fs::write(path, json);
    }
}

/// Re-runs discovery for every agent already in the catalog (loaded from
/// disk at startup, or synced in earlier this run) — the once-per-launch
/// background refresh that keeps the persisted cache from going stale
/// across restarts, without blocking anything on it. Called from
/// `commands::set_project_root` the first time a root becomes available
/// (see `AppState.acp_catalog_refresh_started`'s doc comment for why it's
/// triggered there and not from `lib.rs`'s `.setup()` hook directly).
///
/// A per-agent discovery failure keeps that entry's last-known-good
/// `model_options`/`effort_options` rather than blanking them — a
/// transient failure (binary temporarily missing/busy) shouldn't erase a
/// catalog entry that was working before this refresh happened to run.
pub(crate) async fn refresh_acp_catalog_in_background(app: AppHandle) {
    let snapshot = {
        let state = app.state::<AppState>();
        let catalog = state.acp_agent_catalog.lock().unwrap().clone();
        catalog
    };
    if snapshot.is_empty() {
        return;
    }

    let root = {
        let state = app.state::<AppState>();
        match commands::get_root_path(state.inner()) {
            Ok(root) => root,
            Err(_) => return,
        }
    };

    let mut refreshed = snapshot;
    for entry in refreshed.iter_mut() {
        if let Ok(options) = discover_acp_options(root.clone(), &entry.launch_command).await {
            entry.model_options = options.model;
            entry.effort_options = options.effort;
        }
    }

    save_acp_catalog_to_disk(&refreshed);
    {
        let state = app.state::<AppState>();
        *state.acp_agent_catalog.lock().unwrap() = refreshed.clone();
    }
    let _ = app.emit("acp://catalog-updated", &refreshed);
}
