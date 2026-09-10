use super::{diff_text, fix_literal_escapes, request_permission};
use crate::context;
use crate::state::AppState;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};

pub(super) async fn update_memory(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    root: &Path,
    args: &Value,
) -> Result<String, String> {
    let scope = args
        .get("scope")
        .and_then(|v| v.as_str())
        .ok_or("missing `scope`")?;
    let global = match scope {
        "project" => false,
        "global" => true,
        other => {
            return Err(format!(
                "invalid `scope` {other:?}, expected \"project\" or \"global\""
            ))
        }
    };
    let new_content = args
        .get("content")
        .and_then(|v| v.as_str())
        .map(fix_literal_escapes)
        .ok_or("missing `content`")?;
    let path = context::memory_path(root, global)
        .ok_or("could not determine the global memory file location")?;
    let old_content = std::fs::read_to_string(&path).unwrap_or_default();

    let detail = diff_text(&old_content, &new_content);
    let approved = request_permission(
        app,
        state,
        session_id,
        "edit",
        format!("Update {scope} memory"),
        detail,
    )
    .await;
    if !approved {
        return Ok("The user denied permission to update memory.".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, &new_content).map_err(|e| e.to_string())?;
    Ok(format!(
        "Updated {scope} memory ({} bytes)",
        new_content.len()
    ))
}

pub(super) fn load_skill(
    state: &State<'_, AppState>,
    session_id: &str,
    root: &Path,
    args: &Value,
) -> Result<String, String> {
    let name = args
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("missing `name`")?;
    let touched: Vec<PathBuf> = state
        .touched_dirs
        .lock()
        .unwrap()
        .get(session_id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .collect();
    match context::load_skill_body(root, &touched, name) {
        Some(body) => Ok(body),
        None => {
            let available: Vec<String> = context::list_skills(root, &touched)
                .into_iter()
                .map(|s| s.name)
                .collect();
            let hint = if available.is_empty() {
                "There are no skills available in this project.".to_string()
            } else {
                format!("Available skills: {}.", available.join(", "))
            };
            Ok(format!(
                "No skill named `{name}` found. {hint} Tools (read_file, edit_file, write_file, list_dir, grep, shell) are called directly and are never loaded as skills."
            ))
        }
    }
}
