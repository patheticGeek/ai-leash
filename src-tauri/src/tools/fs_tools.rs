use super::{
    diff_text, fix_literal_escapes, paginate_lines, request_permission, truncate,
    DEFAULT_READ_LIMIT,
};
use crate::commands::{self, IGNORED_NAMES};
use crate::state::AppState;
use ignore::WalkBuilder;
use regex::Regex;
use serde_json::Value;
use std::path::Path;
use tauri::{AppHandle, State};

const MAX_GREP_RESULTS: usize = 200;

fn record_touched_dir(state: &State<'_, AppState>, session_id: &str, dir: &Path) {
    state
        .touched_dirs
        .lock()
        .unwrap()
        .entry(session_id.to_string())
        .or_default()
        .insert(dir.to_path_buf());
}

pub(super) fn read_file(
    state: &State<'_, AppState>,
    session_id: &str,
    root: &Path,
    args: &Value,
) -> Result<String, String> {
    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("missing `path`")?;
    let resolved = commands::resolve_within_root(root, path)?;
    if let Some(parent) = resolved.parent() {
        record_touched_dir(state, session_id, parent);
    }
    let content = std::fs::read_to_string(&resolved).map_err(|e| e.to_string())?;

    let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(1);
    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(DEFAULT_READ_LIMIT);

    Ok(truncate(paginate_lines(
        &content,
        offset,
        limit,
        path,
        "read_file again",
    )))
}

pub(super) fn list_dir(
    state: &State<'_, AppState>,
    session_id: &str,
    root: &Path,
    args: &Value,
) -> Result<String, String> {
    let path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let resolved = commands::resolve_within_root(root, path)?;
    record_touched_dir(state, session_id, &resolved);
    let mut lines = vec![];
    for entry in std::fs::read_dir(&resolved).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let entry_name = entry.file_name().to_string_lossy().to_string();
        if IGNORED_NAMES.contains(&entry_name.as_str()) {
            continue;
        }
        let is_dir = entry.path().is_dir();
        lines.push(format!("{}{}", entry_name, if is_dir { "/" } else { "" }));
    }
    lines.sort();
    Ok(if lines.is_empty() {
        "(empty directory)".to_string()
    } else {
        lines.join("\n")
    })
}

pub(super) fn grep(
    state: &State<'_, AppState>,
    session_id: &str,
    root: &Path,
    args: &Value,
) -> Result<String, String> {
    let pattern = args
        .get("pattern")
        .and_then(|v| v.as_str())
        .ok_or("missing `pattern`")?;
    let subpath = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let search_root = commands::resolve_within_root(root, subpath)?;
    record_touched_dir(state, session_id, &search_root);
    let re = Regex::new(pattern).map_err(|e| e.to_string())?;

    let mut results = vec![];
    'walk: for entry in WalkBuilder::new(&search_root).build() {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(entry.path()) else {
            continue;
        };
        for (i, line) in content.lines().enumerate() {
            if re.is_match(line) {
                let rel = entry
                    .path()
                    .strip_prefix(root)
                    .unwrap_or(entry.path())
                    .display();
                results.push(format!("{}:{}: {}", rel, i + 1, line.trim()));
                if results.len() >= MAX_GREP_RESULTS {
                    break 'walk;
                }
            }
        }
    }
    Ok(if results.is_empty() {
        "no matches".to_string()
    } else {
        results.join("\n")
    })
}

pub(super) async fn edit_file(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    root: &Path,
    args: &Value,
) -> Result<String, String> {
    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("missing `path`")?;
    let old_string = args
        .get("old_string")
        .and_then(|v| v.as_str())
        .map(fix_literal_escapes)
        .ok_or("missing `old_string`")?;
    let new_string = args
        .get("new_string")
        .and_then(|v| v.as_str())
        .map(fix_literal_escapes)
        .ok_or("missing `new_string`")?;
    let resolved = commands::resolve_within_root(root, path)?;
    if let Some(parent) = resolved.parent() {
        record_touched_dir(state, session_id, parent);
    }
    let old_content = std::fs::read_to_string(&resolved).map_err(|e| e.to_string())?;

    let occurrences = old_content.matches(&old_string).count();
    if occurrences == 0 {
        return Ok(format!(
            "`old_string` was not found in {path}. Call read_file to see its exact current contents, then retry with an exact match."
        ));
    }
    if occurrences > 1 {
        return Ok(format!(
            "`old_string` matches {occurrences} locations in {path}. Include more surrounding context so it matches exactly one location."
        ));
    }

    let new_content = old_content.replacen(&old_string, &new_string, 1);
    let detail = diff_text(&old_content, &new_content);
    let approved = request_permission(
        app,
        state,
        session_id,
        "edit",
        format!("Edit {path}"),
        detail,
    )
    .await;
    if !approved {
        return Ok("The user denied permission to edit this file.".into());
    }
    std::fs::write(&resolved, &new_content).map_err(|e| e.to_string())?;
    Ok(format!("Edited {path}"))
}

pub(super) async fn write_file(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    root: &Path,
    args: &Value,
) -> Result<String, String> {
    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("missing `path`")?;
    let new_content = args
        .get("content")
        .and_then(|v| v.as_str())
        .map(fix_literal_escapes)
        .ok_or("missing `content`")?;
    let resolved = commands::resolve_within_root(root, path)?;
    if let Some(parent) = resolved.parent() {
        record_touched_dir(state, session_id, parent);
    }
    let old_content = std::fs::read_to_string(&resolved).unwrap_or_default();

    let detail = diff_text(&old_content, &new_content);
    let approved = request_permission(
        app,
        state,
        session_id,
        "edit",
        format!("Write {path}"),
        detail,
    )
    .await;
    if !approved {
        return Ok("The user denied permission to write this file.".into());
    }
    if let Some(parent) = resolved.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&resolved, &new_content).map_err(|e| e.to_string())?;
    Ok(format!("Wrote {} bytes to {}", new_content.len(), path))
}
