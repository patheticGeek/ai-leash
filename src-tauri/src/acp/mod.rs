mod backend;
mod discovery;
pub mod elicitation;
mod events;
mod permissions;
mod process;
pub mod rate_limit;

use crate::backend::registry::BackendKind;
use crate::commands;
use crate::paths;
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

use discovery::{format_acp_error, model_options_payload, ConfigKind};

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
pub async fn set_session_model(
    state: State<'_, AppState>,
    session_id: String,
    value: String,
) -> Result<(), String> {
    send_set_config(&state, &session_id, ConfigKind::Model, value)
}

#[tauri::command]
pub async fn set_session_effort(
    state: State<'_, AppState>,
    session_id: String,
    value: String,
) -> Result<(), String> {
    send_set_config(&state, &session_id, ConfigKind::Effort, value)
}

/// The agent's own mode (see `find_mode_config_option`) — what the chat
/// bar's permission picker sets when the agent advertises modes.
#[tauri::command]
pub async fn set_session_mode(
    state: State<'_, AppState>,
    session_id: String,
    value: String,
) -> Result<(), String> {
    send_set_config(&state, &session_id, ConfigKind::Mode, value)
}

fn send_set_config(
    state: &AppState,
    session_id: &str,
    kind: ConfigKind,
    value: String,
) -> Result<(), String> {
    let sender = {
        let sessions = state.acp_sessions.lock().unwrap();
        sessions.get(session_id).map(|s| s.sender.clone())
    };
    let sender = sender.ok_or_else(|| {
        "ACP agent process is no longer running; send a message first to start it.".to_string()
    })?;
    sender
        .send(AcpCommand::SetConfig(kind, value))
        .map_err(|_| "ACP agent process is no longer running.".to_string())
}

/// `discover_acp_options`'s result — each field independently `None` when
/// the agent connects fine but simply doesn't expose that config option.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpDiscoveredOptions {
    pub model: Option<serde_json::Value>,
    pub effort: Option<serde_json::Value>,
    pub mode: Option<serde_json::Value>,
}

/// Spawns a throwaway ACP subprocess purely to ask "what models/effort
/// levels do you offer" (via the same Model/ThoughtLevel config options
/// `drive_acp_connection` checks for), then lets the connection close
/// immediately without ever sending a prompt — `connect_with`'s
/// `ChildGuard` kills the subprocess once this closure returns, so there's
/// no separate teardown step: the "fake session" cleans itself up. Not
/// registered in `AppState.acp_sessions`, since it's not a real session
/// anything else should be able to find.
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
            let options = new_session.config_options.unwrap_or_default();
            let payload = |kind: ConfigKind| kind.find(&options).map(model_options_payload);
            Ok(AcpDiscoveredOptions {
                model: payload(ConfigKind::Model),
                effort: payload(ConfigKind::Effort),
                mode: payload(ConfigKind::Mode),
            })
        })
        .await
        .map_err(|e| format_acp_error(&e))
}

/// Rebuilds the catalog from the registry's enabled ACP agents — called at
/// startup and whenever the registry changes. An agent keeps its discovered
/// options while its launch command is unchanged; a new or re-pointed one
/// is discovered in the background (once a project root exists to run it
/// in — before that, `refresh_acp_catalog_in_background` covers it).
pub(crate) fn sync_catalog_with_registry(app: &AppHandle) {
    let state = app.state::<AppState>();
    let agents: Vec<(String, String, String)> = state
        .backends
        .lock()
        .unwrap()
        .backends
        .iter()
        .filter(|b| b.enabled)
        .filter_map(|b| match &b.kind {
            BackendKind::Acp { launch_command } => {
                Some((b.id.clone(), b.label.clone(), launch_command.clone()))
            }
            _ => None,
        })
        .collect();
    let (catalog, undiscovered) = {
        let mut catalog = state.acp_agent_catalog.lock().unwrap();
        let mut undiscovered = Vec::new();
        let next: Vec<AcpAgentCatalogEntry> = agents
            .into_iter()
            .map(|(id, label, launch_command)| {
                let known = catalog
                    .iter()
                    .find(|e| e.id == id && e.launch_command == launch_command);
                // An entry cached before modes were discovered has none —
                // discover it again rather than never showing its modes.
                let (model_options, effort_options, mode_options) = match known {
                    Some(e) if e.mode_options.is_some() => (
                        e.model_options.clone(),
                        e.effort_options.clone(),
                        e.mode_options.clone(),
                    ),
                    _ => {
                        undiscovered.push((id.clone(), launch_command.clone()));
                        (
                            known.and_then(|e| e.model_options.clone()),
                            known.and_then(|e| e.effort_options.clone()),
                            None,
                        )
                    }
                };
                AcpAgentCatalogEntry {
                    id,
                    label,
                    launch_command,
                    model_options,
                    effort_options,
                    mode_options,
                }
            })
            .collect();
        *catalog = next.clone();
        (next, undiscovered)
    };
    save_acp_catalog_to_disk(&catalog);
    let _ = app.emit("acp://catalog-updated", &catalog);

    let Ok(root) = commands::get_root_path(state.inner()) else {
        return;
    };
    for (id, launch_command) in undiscovered {
        let app = app.clone();
        let root = root.clone();
        tauri::async_runtime::spawn(async move {
            if let Ok(options) = discover_acp_options(root, &launch_command).await {
                record_discovered(&app, &id, &launch_command, options);
            }
        });
    }
}

/// Stores one agent's freshly discovered options — only if the catalog
/// still has it with the same launch command (it may have been edited or
/// removed while discovery ran).
fn record_discovered(
    app: &AppHandle,
    id: &str,
    launch_command: &str,
    options: AcpDiscoveredOptions,
) {
    let state = app.state::<AppState>();
    let catalog = {
        let mut catalog = state.acp_agent_catalog.lock().unwrap();
        let Some(entry) = catalog
            .iter_mut()
            .find(|e| e.id == id && e.launch_command == launch_command)
        else {
            return;
        };
        entry.model_options = options.model;
        entry.effort_options = options.effort;
        entry.mode_options = options.mode;
        catalog.clone()
    };
    save_acp_catalog_to_disk(&catalog);
    let _ = app.emit("acp://catalog-updated", &catalog);
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

    for entry in snapshot {
        if let Ok(options) = discover_acp_options(root.clone(), &entry.launch_command).await {
            record_discovered(&app, &entry.id, &entry.launch_command, options);
        }
    }
}
