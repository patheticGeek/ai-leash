use crate::state::AppState;
use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub const IGNORED_NAMES: &[&str] = &[".git", "node_modules", "target", "dist"];

pub fn resolve_within_root(root: &Path, requested: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(requested);
    let joined = if candidate.is_absolute() {
        candidate
    } else {
        root.join(candidate)
    };
    let root_canonical = root.canonicalize().map_err(|e| e.to_string())?;
    let canonical = if joined.exists() {
        joined.canonicalize().map_err(|e| e.to_string())?
    } else {
        let parent = joined.parent().ok_or("invalid path")?;
        let parent_canonical = parent.canonicalize().map_err(|e| e.to_string())?;
        parent_canonical.join(joined.file_name().ok_or("invalid path")?)
    };
    if !canonical.starts_with(&root_canonical) {
        return Err("path escapes project root".into());
    }
    Ok(canonical)
}

pub fn get_root_path(state: &AppState) -> Result<PathBuf, String> {
    state
        .project_root
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "no project open".to_string())
}

#[tauri::command]
pub fn set_project_root(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("not a directory".into());
    }
    *state.project_root.lock().unwrap() = Some(p.clone());
    start_fs_watcher(app, &state, &p)?;
    Ok(())
}

/// Watches the project root recursively and tells the frontend to refresh
/// the file tree whenever anything changes underneath it — file edits from
/// the agent's tools, `git checkout`/builds run in the terminal, or changes
/// made outside the app entirely. Events are debounced (batched over a short
/// window) so a burst of changes (e.g. a build writing many files) triggers
/// one refresh instead of a flood of them. Replacing `state.fs_watcher` (on
/// the next `set_project_root` call) drops this watcher and its background
/// thread exits on its own once the channel closes.
fn start_fs_watcher(app: AppHandle, state: &State<AppState>, root: &Path) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher =
        notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if res.is_ok() {
                let _ = tx.send(());
            }
        })
        .map_err(|e| e.to_string())?;
    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    *state.fs_watcher.lock().unwrap() = Some(watcher);

    std::thread::spawn(move || {
        const DEBOUNCE: Duration = Duration::from_millis(300);
        while rx.recv().is_ok() {
            let deadline = Instant::now() + DEBOUNCE;
            while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
                if remaining.is_zero() || rx.recv_timeout(remaining).is_err() {
                    break;
                }
            }
            if app.emit("fs://changed", ()).is_err() {
                break;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn get_project_root(state: State<AppState>) -> Option<String> {
    state
        .project_root
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.display().to_string())
}

#[tauri::command]
pub fn list_dir(
    state: State<AppState>,
    path: Option<String>,
) -> Result<Vec<DirEntryInfo>, String> {
    let root_guard = state.project_root.lock().unwrap();
    let root = root_guard.as_ref().ok_or("no project open")?;
    let target = match path {
        Some(p) => resolve_within_root(root, &p)?,
        None => root.clone(),
    };

    let mut entries = vec![];
    for entry in std::fs::read_dir(&target).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if IGNORED_NAMES.contains(&name.as_str()) {
            continue;
        }
        let entry_path = entry.path();
        entries.push(DirEntryInfo {
            name,
            path: entry_path.display().to_string(),
            is_dir: entry_path.is_dir(),
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub fn read_file_text(state: State<AppState>, path: String) -> Result<String, String> {
    let root_guard = state.project_root.lock().unwrap();
    let root = root_guard.as_ref().ok_or("no project open")?;
    let resolved = resolve_within_root(root, &path)?;
    std::fs::read_to_string(resolved).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file_text(
    state: State<AppState>,
    path: String,
    contents: String,
) -> Result<(), String> {
    let root_guard = state.project_root.lock().unwrap();
    let root = root_guard.as_ref().ok_or("no project open")?;
    let resolved = resolve_within_root(root, &path)?;
    std::fs::write(resolved, contents).map_err(|e| e.to_string())
}
