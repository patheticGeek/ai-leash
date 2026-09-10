//! User-defined named background commands ("Actions" — e.g. `dev` ->
//! `npm run dev`), persisted per-project in `.ai-leash/actions.json`
//! (git-shareable, same convention as `context.rs`'s memory files) and
//! runnable both from the UI and by an agent (native tools.rs arms, and via
//! `mcp_bridge` for ACP agents). At most one live run per action — see
//! `run_action`'s doc comment.

use crate::commands;
use crate::pty;
use crate::state::AppState;
use crate::tools;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

/// Ring-buffer cap for a running action's captured output — backs both
/// `read_action` (agent-facing) and `action_backlog` (frontend terminal-tab
/// replay on open). Raw bytes, not per-line, so this trims from the front
/// rather than tracking a line count.
const MAX_OUTPUT_BYTES: usize = 256 * 1024;

#[derive(Clone, Serialize, Deserialize)]
pub struct ActionDef {
    pub id: String,
    pub name: String,
    pub command: String,
}

/// One action's live (or most recently finished) process — in-memory only,
/// not persisted. `pty_id` indexes into `AppState.ptys` (see `pty.rs`) for
/// the actual process/IO; whether it's *currently* running is checked
/// lazily via `pty::is_running` rather than tracked here, since a process
/// can exit on its own (e.g. a dev server crashing) with nothing to tell
/// this struct about it.
pub struct ActionRun {
    pub pty_id: String,
    pub started_at: i64,
    pub output: Arc<StdMutex<Vec<u8>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActionWithStatus {
    pub id: String,
    pub name: String,
    pub command: String,
    pub running: bool,
    pub started_at: Option<i64>,
    /// The pty backing the current (or most recent) run, if any — the
    /// frontend subscribes to `pty://{ptyId}/data` on it directly, the
    /// same event a plain terminal tab already listens to (see
    /// `ActionTerminalTab.tsx`).
    pub pty_id: Option<String>,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn actions_path(root: &Path) -> PathBuf {
    root.join(".ai-leash").join("actions.json")
}

pub fn load_actions(root: &Path) -> Vec<ActionDef> {
    std::fs::read_to_string(actions_path(root))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_actions(root: &Path, actions: &[ActionDef]) -> Result<(), String> {
    let path = actions_path(root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(actions).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

fn find_def<'a>(defs: &'a [ActionDef], key: &str) -> Result<&'a ActionDef, String> {
    defs.iter()
        .find(|a| a.id == key || a.name == key)
        .ok_or_else(|| format!("no action named `{key}`"))
}

/// Starts an action's command in a background pty, unless it's already
/// running — re-running a live action is a deliberate no-op (not a
/// restart), so a stray duplicate call (agent or user) can't kill a
/// mid-flight process like a dev server out from under itself. Explicit
/// `stop_action` + `run_action` restarts it.
pub fn run_action(app: &AppHandle, root: &Path, key: &str) -> Result<String, String> {
    let defs = load_actions(root);
    let def = find_def(&defs, key)?.clone();

    let state = app.state::<AppState>();
    {
        let runs = state.action_runs.lock().unwrap();
        if let Some(run) = runs.get(&def.id) {
            if pty::is_running(&state, &run.pty_id) {
                return Ok(format!("Action `{}` is already running.", def.name));
            }
        }
    }

    let output: Arc<StdMutex<Vec<u8>>> = Arc::new(StdMutex::new(Vec::new()));
    let output_for_cb = output.clone();
    let pty_id = pty::spawn_command_pty(
        app,
        &state,
        Some(root.display().to_string()),
        &def.command,
        Box::new(move |chunk: &[u8]| {
            let mut buf = output_for_cb.lock().unwrap();
            buf.extend_from_slice(chunk);
            if buf.len() > MAX_OUTPUT_BYTES {
                let excess = buf.len() - MAX_OUTPUT_BYTES;
                buf.drain(0..excess);
            }
        }),
    )?;

    state.action_runs.lock().unwrap().insert(
        def.id.clone(),
        ActionRun {
            pty_id,
            started_at: now(),
            output,
        },
    );

    Ok(format!("Started action `{}`.", def.name))
}

pub fn stop_action(app: &AppHandle, root: &Path, key: &str) -> Result<String, String> {
    let defs = load_actions(root);
    let def = find_def(&defs, key)?;

    let state = app.state::<AppState>();
    let pty_id = {
        let runs = state.action_runs.lock().unwrap();
        runs.get(&def.id).map(|r| r.pty_id.clone())
    };
    match pty_id {
        Some(id) if pty::is_running(&state, &id) => {
            pty::pty_kill(state.clone(), id)?;
            state.action_runs.lock().unwrap().remove(&def.id);
            Ok(format!("Stopped action `{}`.", def.name))
        }
        _ => Ok(format!("Action `{}` is not running.", def.name)),
    }
}

/// Text summary for the agent-facing `list_actions` tool — the frontend
/// gets structured data instead, via the `list_actions` Tauri command
/// below (unfortunately named the same; they're in different namespaces
/// and never called from the same context).
pub fn list_actions_status(app: &AppHandle, root: &Path) -> String {
    let defs = load_actions(root);
    if defs.is_empty() {
        return "No actions defined for this project.".to_string();
    }
    let state = app.state::<AppState>();
    let runs = state.action_runs.lock().unwrap();
    defs.iter()
        .map(|def| {
            let running = runs
                .get(&def.id)
                .is_some_and(|r| pty::is_running(&state, &r.pty_id));
            format!(
                "- {} ({}): {}",
                def.name,
                if running { "running" } else { "stopped" },
                def.command
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn read_action_output(app: &AppHandle, root: &Path, key: &str) -> Result<String, String> {
    let defs = load_actions(root);
    let def = find_def(&defs, key)?;
    let state = app.state::<AppState>();
    let runs = state.action_runs.lock().unwrap();
    let run = runs
        .get(&def.id)
        .ok_or_else(|| format!("Action `{}` hasn't been run yet.", def.name))?;
    let buf = run.output.lock().unwrap();
    Ok(tools::truncate(String::from_utf8_lossy(&buf).into_owned()))
}

// --- Frontend-facing Tauri commands ---

#[tauri::command]
pub fn list_actions(state: State<AppState>) -> Result<Vec<ActionWithStatus>, String> {
    let root = commands::get_root_path(state.inner())?;
    let defs = load_actions(&root);
    let runs = state.action_runs.lock().unwrap();
    Ok(defs
        .into_iter()
        .map(|def| {
            let run = runs.get(&def.id);
            let running = run.is_some_and(|r| pty::is_running(&state, &r.pty_id));
            ActionWithStatus {
                id: def.id,
                name: def.name,
                command: def.command,
                running,
                started_at: run.map(|r| r.started_at),
                pty_id: run.map(|r| r.pty_id.clone()),
            }
        })
        .collect())
}

fn new_action(root: &Path, name: String, command: String) -> Result<ActionDef, String> {
    let mut defs = load_actions(root);
    let def = ActionDef {
        id: Uuid::new_v4().to_string(),
        name,
        command,
    };
    defs.push(def.clone());
    save_actions(root, &defs)?;
    Ok(def)
}

#[tauri::command]
pub fn create_action(
    state: State<AppState>,
    name: String,
    command: String,
) -> Result<ActionDef, String> {
    let root = commands::get_root_path(state.inner())?;
    new_action(&root, name, command)
}

/// Agent-facing counterpart to `create_action`, gated behind the same
/// write/edit permission prompt as `write_file`/`edit_file` (see
/// `tools.rs`'s `create_action` arm) — unlike `run_action`/`stop_action`,
/// this introduces a *new* command the user hasn't vetted yet.
pub fn create_action_tool(root: &Path, name: &str, command: &str) -> Result<String, String> {
    let def = new_action(root, name.to_string(), command.to_string())?;
    Ok(format!(
        "Created action `{}` ({}). Run it with run_action.",
        def.name, def.command
    ))
}

#[tauri::command]
pub fn update_action(
    state: State<AppState>,
    id: String,
    name: String,
    command: String,
) -> Result<(), String> {
    let root = commands::get_root_path(state.inner())?;
    let mut defs = load_actions(&root);
    let def = defs
        .iter_mut()
        .find(|a| a.id == id)
        .ok_or("no such action")?;
    def.name = name;
    def.command = command;
    save_actions(&root, &defs)
}

#[tauri::command]
pub fn delete_action(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let root = commands::get_root_path(state.inner())?;
    let _ = stop_action(&app, &root, &id);
    let mut defs = load_actions(&root);
    defs.retain(|a| a.id != id);
    save_actions(&root, &defs)?;
    state.action_runs.lock().unwrap().remove(&id);
    Ok(())
}

#[tauri::command]
pub fn run_action_cmd(
    app: AppHandle,
    state: State<AppState>,
    id: String,
) -> Result<String, String> {
    let root = commands::get_root_path(state.inner())?;
    run_action(&app, &root, &id)
}

#[tauri::command]
pub fn stop_action_cmd(
    app: AppHandle,
    state: State<AppState>,
    id: String,
) -> Result<String, String> {
    let root = commands::get_root_path(state.inner())?;
    stop_action(&app, &root, &id)
}

/// Base64-encoded raw output captured so far, for a terminal tab to replay
/// on open before attaching to the live `pty://{pty_id}/data` stream — see
/// `ActionTerminalTab.tsx`. Empty (not an error) if the action has never
/// been run.
#[tauri::command]
pub fn action_backlog(state: State<AppState>, id: String) -> Result<String, String> {
    let runs = state.action_runs.lock().unwrap();
    match runs.get(&id) {
        Some(run) => Ok(general_purpose::STANDARD.encode(&*run.output.lock().unwrap())),
        None => Ok(String::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let path = std::env::temp_dir().join(format!("ai-leash-actions-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn load_actions_is_empty_for_a_project_with_no_actions_file() {
        assert!(load_actions(&temp_root()).is_empty());
    }

    #[test]
    fn save_and_load_round_trips_defined_actions() {
        let root = temp_root();
        let defs = vec![
            ActionDef {
                id: "id-1".into(),
                name: "dev".into(),
                command: "npm run dev".into(),
            },
            ActionDef {
                id: "id-2".into(),
                name: "test".into(),
                command: "npm test".into(),
            },
        ];
        save_actions(&root, &defs).unwrap();

        let loaded = load_actions(&root);
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].name, "dev");
        assert_eq!(loaded[0].command, "npm run dev");
        assert_eq!(loaded[1].id, "id-2");
    }

    #[test]
    fn load_actions_treats_corrupt_json_as_empty_rather_than_panicking() {
        let root = temp_root();
        std::fs::create_dir_all(root.join(".ai-leash")).unwrap();
        std::fs::write(root.join(".ai-leash/actions.json"), "not json").unwrap();
        assert!(load_actions(&root).is_empty());
    }

    #[test]
    fn find_def_resolves_by_either_id_or_name() {
        let defs = vec![ActionDef {
            id: "abc-123".into(),
            name: "dev".into(),
            command: "npm run dev".into(),
        }];
        assert_eq!(find_def(&defs, "abc-123").unwrap().name, "dev");
        assert_eq!(find_def(&defs, "dev").unwrap().id, "abc-123");
        assert!(find_def(&defs, "no-such-action").is_err());
    }
}
