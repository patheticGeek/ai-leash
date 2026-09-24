//! User-defined named background commands ("Actions" — e.g. `dev` ->
//! `npm run dev`), persisted per-project in `.ai-leash/actions.json`
//! (git-shareable, same convention as `context.rs`'s memory files) and
//! runnable both from the UI and by an agent (native tools.rs arms, and via
//! `mcp_bridge` for ACP agents). At most one live run per action — see
//! `run_action`'s doc comment.

use crate::db;
use crate::pty;
use crate::run::{Run, RunHandle, RunOutputChunk};
use crate::state::AppState;
use crate::tools::MAX_TOOL_OUTPUT;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
pub struct ActionDef {
    pub id: String,
    pub name: String,
    pub command: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActionWithStatus {
    pub id: String,
    pub name: String,
    pub command: String,
    pub running: bool,
    pub started_at: Option<i64>,
    /// The pty backing the current (or most recent) run, if any — what
    /// `ActionTerminalTab.tsx` forwards typing and resizes to while the run
    /// is live. Its output arrives as `run://output`, not per-pty events.
    pub pty_id: Option<String>,
    /// The current (or most recent) run's own id, status (`running`,
    /// `exited`, `stopped`), exit code and end time — see `run.rs`. A run is
    /// kept after it ends, so these describe the last outcome too.
    pub run_id: Option<String>,
    pub status: Option<&'static str>,
    pub exit_code: Option<u32>,
    pub ended_at: Option<i64>,
    /// True for the one action last run in this checkout — persisted (see
    /// `db/action_last_run.rs`), unlike `started_at`, so it survives a stop
    /// or an app restart. False for all if nothing has run yet or that
    /// action has since been deleted.
    pub last_run: bool,
}

/// Payload of `run://status` — one global event for every Action run, fired
/// when a run starts, is stopped, or its process exits. Carries the new
/// state, so the frontend patches its `["actions", checkoutPath]` cache
/// entry directly instead of polling (see `src/data/actionEvents.ts`).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RunStatusEvent {
    checkout_path: String,
    action_id: String,
    run_id: String,
    pty_id: String,
    status: &'static str,
    exit_code: Option<u32>,
    started_at: i64,
    ended_at: Option<i64>,
}

fn emit_run_status(app: &AppHandle, key: &(String, String), run: &Run) {
    let _ = app.emit(
        "run://status",
        RunStatusEvent {
            checkout_path: key.0.clone(),
            action_id: key.1.clone(),
            run_id: run.id.clone(),
            pty_id: run.pty_id.clone(),
            status: run.status.as_str(),
            exit_code: run.exit_code,
            started_at: run.started_at,
            ended_at: run.ended_at,
        },
    );
}

/// `action://defs-changed {checkoutPath}` — an Action was created, edited or
/// deleted in that checkout; the frontend refetches its list.
fn emit_defs_changed(app: &AppHandle, root: &Path) {
    let _ = app.emit(
        "action://defs-changed",
        serde_json::json!({ "checkoutPath": root.display().to_string() }),
    );
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

/// `AppState.runs`' key — the checkout is part of it, not just the action
/// id, because `.ai-leash/actions.json` is a real tracked file: two
/// worktrees of the same project can each have their own copy (same ids,
/// until one diverges), and a run started in one must never show as running
/// for a conversation pinned to the other.
fn run_key(root: &Path, action_id: &str) -> (String, String) {
    (root.display().to_string(), action_id.to_string())
}

/// Starts an action's command in a background pty, unless it's already
/// running — re-running a live action is a deliberate no-op (not a
/// restart), so a stray duplicate call (agent or user) can't kill a
/// mid-flight process like a dev server out from under itself. Explicit
/// `stop_action` + `run_action` restarts it. A finished run is replaced by
/// the new one.
pub fn run_action(app: &AppHandle, root: &Path, key: &str) -> Result<String, String> {
    let defs = load_actions(root);
    let def = find_def(&defs, key)?.clone();

    let state = app.state::<AppState>();
    let key = run_key(root, &def.id);
    if let Some(run) = state.runs.get(&key) {
        let run = run.lock().unwrap();
        if run.is_running() {
            return Ok(format!(
                "Action `{}` is already running (run {}).",
                def.name, run.id
            ));
        }
    }

    let run_id = Uuid::new_v4().to_string();
    let run: RunHandle = Arc::new(StdMutex::new(Run::new(run_id.clone(), now())));
    let on_data_run = run.clone();
    let on_exit_run = run.clone();
    let on_exit_app = app.clone();
    let on_exit_key = key.clone();
    let pty_id = pty::spawn_command_pty(
        app,
        &state,
        Some(root.display().to_string()),
        &def.command,
        Box::new(move |chunk: &[u8]| on_data_run.lock().unwrap().output.append(chunk)),
        Box::new(move |code| {
            let mut run = on_exit_run.lock().unwrap();
            if run.finish(code, now()) {
                emit_run_status(&on_exit_app, &on_exit_key, &run);
            }
        }),
    )?;
    run.lock().unwrap().pty_id = pty_id;

    // Here rather than in `run_action_cmd` so runs started by an agent
    // (native tool or MCP bridge) count as "last ran" too.
    db::set_last_run_action(&state.db, &key.0, &key.1);
    emit_run_status(app, &key, &run.lock().unwrap());
    crate::run::spawn_output_flusher(app.clone(), run.clone());
    state.runs.insert(key, run);

    Ok(format!("Started action `{}` (run {run_id}).", def.name))
}

/// Kills the running process but keeps the run (now `stopped`), so its
/// output stays readable with `read_action`.
pub fn stop_action(app: &AppHandle, root: &Path, key: &str) -> Result<String, String> {
    let defs = load_actions(root);
    let def = find_def(&defs, key)?;

    let state = app.state::<AppState>();
    let key = run_key(root, &def.id);
    let Some(run) = state.runs.get(&key) else {
        return Ok(format!("Action `{}` is not running.", def.name));
    };
    let pty_id = {
        let mut run = run.lock().unwrap();
        if !run.is_running() {
            return Ok(format!("Action `{}` is not running.", def.name));
        }
        run.mark_stopped(now());
        emit_run_status(app, &key, &run);
        run.pty_id.clone()
    };
    pty::pty_kill(state.clone(), pty_id)?;
    Ok(format!("Stopped action `{}`.", def.name))
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
    defs.iter()
        .map(|def| {
            let status = state
                .runs
                .get(&run_key(root, &def.id))
                .map(|r| r.lock().unwrap().describe_status())
                .unwrap_or_else(|| "not run yet".to_string());
            format!("- {} ({status}): {}", def.name, def.command)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The agent-facing `read_action`: a status header, then the captured
/// output from byte offset `since` on (everything still held if `None`).
/// Output beyond the tool-output cap keeps its *end* — the newest lines are
/// the ones that say whether a dev server is up or a build failed — and the
/// header gives the offsets so the agent can page or poll for only new
/// output next time.
pub fn read_action_output(
    app: &AppHandle,
    root: &Path,
    key: &str,
    since: Option<u64>,
) -> Result<String, String> {
    let defs = load_actions(root);
    let def = find_def(&defs, key)?;
    let state = app.state::<AppState>();
    let run = state
        .runs
        .get(&run_key(root, &def.id))
        .ok_or_else(|| format!("Action `{}` hasn't been run yet.", def.name))?;
    let run = run.lock().unwrap();
    let end = run.output.end();
    let (mut from, bytes) = run.output.since(since);
    let mut text = String::from_utf8_lossy(bytes).into_owned();
    let mut notes = Vec::new();
    if since.is_some_and(|s| s < from) {
        notes.push("older output was already discarded".to_string());
    }
    if text.len() > MAX_TOOL_OUTPUT {
        let mut cut = text.len() - MAX_TOOL_OUTPUT;
        while !text.is_char_boundary(cut) {
            cut += 1;
        }
        text.drain(..cut);
        from = end - text.len() as u64;
        notes.push("only the newest part is shown".to_string());
    }
    let mut header = format!(
        "Status: {} (run {})\nOutput bytes {from}-{end}",
        run.describe_status(),
        run.id
    );
    if !notes.is_empty() {
        header.push_str(&format!(" ({})", notes.join("; ")));
    }
    header.push_str(&format!(
        ". Call read_action with since={end} to read only newer output."
    ));
    Ok(format!("{header}\n---\n{text}"))
}

// --- Frontend-facing Tauri commands ---

/// Actions and their run status are scoped to a checkout path directly
/// (not a session id) — see `run_key`'s doc comment on why
/// the checkout, not just the action id, has to be part of the key:
/// `.ai-leash/actions.json` is a real tracked file, so two worktrees of the
/// same project can each have their own copy. The frontend already has to
/// resolve this same path itself (it's what these commands' React Query
/// cache is keyed on — see `useActions.ts`), so these take it directly
/// rather than a session id the backend would just re-resolve to the same
/// path via `get_session_root`.
#[tauri::command]
pub fn list_actions(
    state: State<AppState>,
    checkout_path: String,
) -> Result<Vec<ActionWithStatus>, String> {
    let root = PathBuf::from(checkout_path);
    let defs = load_actions(&root);
    let last_run_id = db::get_last_run_action(&state.db, &root.display().to_string());
    Ok(defs
        .into_iter()
        .map(|def| {
            let run = state.runs.get(&run_key(&root, &def.id));
            let run = run.as_ref().map(|r| r.lock().unwrap());
            ActionWithStatus {
                last_run: last_run_id.as_deref() == Some(def.id.as_str()),
                running: run.as_ref().is_some_and(|r| r.is_running()),
                started_at: run.as_ref().map(|r| r.started_at),
                pty_id: run.as_ref().map(|r| r.pty_id.clone()),
                run_id: run.as_ref().map(|r| r.id.clone()),
                status: run.as_ref().map(|r| r.status.as_str()),
                exit_code: run.as_ref().and_then(|r| r.exit_code),
                ended_at: run.as_ref().and_then(|r| r.ended_at),
                id: def.id,
                name: def.name,
                command: def.command,
            }
        })
        .collect())
}

fn new_action(
    app: &AppHandle,
    root: &Path,
    name: String,
    command: String,
) -> Result<ActionDef, String> {
    let mut defs = load_actions(root);
    let def = ActionDef {
        id: Uuid::new_v4().to_string(),
        name,
        command,
    };
    defs.push(def.clone());
    save_actions(root, &defs)?;
    emit_defs_changed(app, root);
    Ok(def)
}

#[tauri::command]
pub fn create_action(
    app: AppHandle,
    checkout_path: String,
    name: String,
    command: String,
) -> Result<ActionDef, String> {
    let root = PathBuf::from(checkout_path);
    new_action(&app, &root, name, command)
}

/// Agent-facing counterpart to `create_action`, gated behind the same
/// write/edit permission prompt as `write_file`/`edit_file` (see
/// `tools.rs`'s `create_action` arm) — unlike `run_action`/`stop_action`,
/// this introduces a *new* command the user hasn't vetted yet.
pub fn create_action_tool(
    app: &AppHandle,
    root: &Path,
    name: &str,
    command: &str,
) -> Result<String, String> {
    let def = new_action(app, root, name.to_string(), command.to_string())?;
    Ok(format!(
        "Created action `{}` ({}). Run it with run_action.",
        def.name, def.command
    ))
}

#[tauri::command]
pub fn update_action(
    app: AppHandle,
    checkout_path: String,
    id: String,
    name: String,
    command: String,
) -> Result<(), String> {
    let root = PathBuf::from(checkout_path);
    let mut defs = load_actions(&root);
    let def = defs
        .iter_mut()
        .find(|a| a.id == id)
        .ok_or("no such action")?;
    def.name = name;
    def.command = command;
    save_actions(&root, &defs)?;
    emit_defs_changed(&app, &root);
    Ok(())
}

#[tauri::command]
pub fn delete_action(
    app: AppHandle,
    state: State<AppState>,
    checkout_path: String,
    id: String,
) -> Result<(), String> {
    let root = PathBuf::from(checkout_path);
    let _ = stop_action(&app, &root, &id);
    let mut defs = load_actions(&root);
    defs.retain(|a| a.id != id);
    save_actions(&root, &defs)?;
    db::clear_last_run_action(&state.db, &root.display().to_string(), &id);
    state.runs.remove(&run_key(&root, &id));
    emit_defs_changed(&app, &root);
    Ok(())
}

#[tauri::command]
pub fn run_action_cmd(app: AppHandle, checkout_path: String, id: String) -> Result<String, String> {
    let root = PathBuf::from(checkout_path);
    run_action(&app, &root, &id)
}

#[tauri::command]
pub fn stop_action_cmd(
    app: AppHandle,
    checkout_path: String,
    id: String,
) -> Result<String, String> {
    let root = PathBuf::from(checkout_path);
    stop_action(&app, &root, &id)
}

/// Everything a run still holds, as a `run://output`-shaped chunk — what a
/// terminal writes first when it attaches, before following `run://output`
/// from the chunk's end (see `ActionTerminalTab.tsx`). Works for a finished
/// run too. Errors if the run is gone (the Action was run again or deleted).
#[tauri::command]
pub fn run_snapshot(state: State<AppState>, run_id: String) -> Result<RunOutputChunk, String> {
    let run = state.runs.by_id(&run_id).ok_or("no such run")?;
    let run = run.lock().unwrap();
    Ok(run.chunk_since(None))
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
