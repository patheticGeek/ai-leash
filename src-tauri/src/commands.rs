use crate::state::AppState;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

const IGNORED_NAMES: &[&str] = &[".git", "node_modules", "target", "dist"];

fn resolve_within_root(root: &Path, requested: &str) -> Result<PathBuf, String> {
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

#[tauri::command]
pub fn set_project_root(state: State<AppState>, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("not a directory".into());
    }
    *state.project_root.lock().unwrap() = Some(p);
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
