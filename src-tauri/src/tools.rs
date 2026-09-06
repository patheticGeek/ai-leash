use crate::commands::{self, IGNORED_NAMES};
use crate::context;
use crate::state::AppState;
use ignore::WalkBuilder;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use similar::{ChangeTag, TextDiff};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
pub struct ToolCall {
    #[serde(default)]
    pub id: Option<String>,
    pub function: ToolCallFunction,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    #[serde(default)]
    pub arguments: Value,
}

#[derive(Serialize, Clone)]
struct PermissionRequest {
    id: String,
    kind: String,
    title: String,
    detail: String,
}

const MAX_TOOL_OUTPUT: usize = 20_000;
const MAX_GREP_RESULTS: usize = 200;
const DEFAULT_READ_LIMIT: usize = 2000;

pub fn tool_definitions(root: Option<&Path>, touched_dirs: &[PathBuf]) -> Value {
    let mut tools = json!([
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read a file's contents. Always call this before edit_file so you know the file's exact current contents. For large files, prefer reading a specific range with `offset`/`limit` instead of the whole file at once: start with a small `limit` or use `grep` to find the area you care about, then read just that range.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path relative to the project root" },
                        "offset": { "type": "integer", "description": "1-based line number to start reading from. Omit to start at line 1." },
                        "limit": { "type": "integer", "description": "Maximum number of lines to return. Defaults to 2000." }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Replace one exact snippet of text in an existing file with new text, leaving the rest of the file untouched. You must call read_file first and copy `old_string` verbatim from its output (matching whitespace and indentation exactly) so it matches exactly one location; include a line or two of surrounding context if the snippet isn't unique on its own. Do not use this to create a new file, use write_file instead.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path relative to the project root" },
                        "old_string": { "type": "string", "description": "The exact existing text to replace, copied verbatim from read_file's output" },
                        "new_string": { "type": "string", "description": "The text to replace it with" }
                    },
                    "required": ["path", "old_string", "new_string"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Create a new file, or completely overwrite an existing one, with the given full contents. Prefer edit_file for changing part of a file that already exists. If the file already exists, call read_file first so you know what you're replacing.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path relative to the project root" },
                        "content": { "type": "string", "description": "The complete contents to write to the file" }
                    },
                    "required": ["path", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_dir",
                "description": "List files and directories at a given path in the project.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path relative to the project root, use \".\" for the root" }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "grep",
                "description": "Search for a regular expression pattern across project files (respects .gitignore).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Regular expression to search for" },
                        "path": { "type": "string", "description": "Subdirectory relative to project root to search, defaults to the root" }
                    },
                    "required": ["pattern"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "shell",
                "description": "Run a shell command in the project root and return its combined stdout/stderr. Requires user approval.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "The shell command to execute" }
                    },
                    "required": ["command"]
                }
            }
        }
    ]);

    let has_skills = root.is_some_and(|r| !context::list_skills(r, touched_dirs).is_empty());
    if has_skills {
        if let Value::Array(arr) = &mut tools {
            arr.push(json!({
                "type": "function",
                "function": {
                    "name": "load_skill",
                    "description": "Load the full instructions for a skill listed under \"Available skills\" in your system prompt, by its exact name. Only use this for names listed there — tools (read_file, edit_file, write_file, list_dir, grep, shell) are called directly and are never loaded as skills.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string", "description": "Exact name of the skill to load" }
                        },
                        "required": ["name"]
                    }
                }
            }));
        }
    }
    tools
}

async fn request_permission(
    app: &AppHandle,
    state: &State<'_, AppState>,
    kind: &str,
    title: String,
    detail: String,
) -> bool {
    let id = Uuid::new_v4().to_string();
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .pending_permissions
        .lock()
        .unwrap()
        .insert(id.clone(), tx);
    let _ = app.emit(
        "permission://request",
        PermissionRequest {
            id,
            kind: kind.into(),
            title,
            detail,
        },
    );
    rx.await.unwrap_or(false)
}

fn truncate(mut s: String) -> String {
    if s.len() > MAX_TOOL_OUTPUT {
        s.truncate(MAX_TOOL_OUTPUT);
        s.push_str("\n...[truncated]");
    }
    s
}

/// Small local models sometimes emit tool-call string arguments where newlines
/// were double-escaped into literal backslash-n instead of real line breaks.
/// If a string has zero real newlines but does contain literal `\n`, that's a
/// reliable enough signal of the mis-escape to safely unescape it.
fn fix_literal_escapes(s: &str) -> String {
    if s.contains('\n') || !s.contains("\\n") {
        return s.to_string();
    }
    s.replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
}

fn diff_text(old: &str, new: &str) -> String {
    let diff = TextDiff::from_lines(old, new);
    let mut out = String::new();
    for change in diff.iter_all_changes() {
        let prefix = match change.tag() {
            ChangeTag::Delete => "- ",
            ChangeTag::Insert => "+ ",
            ChangeTag::Equal => "  ",
        };
        out.push_str(prefix);
        out.push_str(change.value());
    }
    out
}

fn record_touched_dir(state: &State<'_, AppState>, session_id: &str, dir: &Path) {
    state
        .touched_dirs
        .lock()
        .unwrap()
        .entry(session_id.to_string())
        .or_default()
        .insert(dir.to_path_buf());
}

pub async fn execute_tool(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    name: &str,
    args: &Value,
) -> Result<String, String> {
    let root = commands::get_root_path(state.inner())?;

    match name {
        "read_file" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("missing `path`")?;
            let resolved = commands::resolve_within_root(&root, path)?;
            if let Some(parent) = resolved.parent() {
                record_touched_dir(state, session_id, parent);
            }
            let content = std::fs::read_to_string(&resolved).map_err(|e| e.to_string())?;

            let total_lines = content.lines().count();
            let offset = args
                .get("offset")
                .and_then(|v| v.as_u64())
                .unwrap_or(1)
                .max(1) as usize;
            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or(DEFAULT_READ_LIMIT);

            let start_idx = offset - 1;
            if start_idx >= total_lines && total_lines > 0 {
                return Ok(format!(
                    "{path} has only {total_lines} lines; offset {offset} is beyond the end of the file."
                ));
            }

            let selected: Vec<&str> = content.lines().skip(start_idx).take(limit).collect();
            let end_line = start_idx + selected.len();
            let mut out = selected.join("\n");
            if start_idx > 0 || end_line < total_lines {
                out.push_str(&format!(
                    "\n\n[showing lines {}-{end_line} of {total_lines} in {path}; call read_file again with offset={} to continue]",
                    offset,
                    end_line + 1,
                ));
            }
            Ok(truncate(out))
        }
        "list_dir" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
            let resolved = commands::resolve_within_root(&root, path)?;
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
        "grep" => {
            let pattern = args
                .get("pattern")
                .and_then(|v| v.as_str())
                .ok_or("missing `pattern`")?;
            let subpath = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
            let search_root = commands::resolve_within_root(&root, subpath)?;
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
                            .strip_prefix(&root)
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
        "edit_file" => {
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
            let resolved = commands::resolve_within_root(&root, path)?;
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
            let approved =
                request_permission(app, state, "edit", format!("Edit {path}"), detail).await;
            if !approved {
                return Ok("The user denied permission to edit this file.".into());
            }
            std::fs::write(&resolved, &new_content).map_err(|e| e.to_string())?;
            Ok(format!("Edited {path}"))
        }
        "write_file" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("missing `path`")?;
            let new_content = args
                .get("content")
                .and_then(|v| v.as_str())
                .map(fix_literal_escapes)
                .ok_or("missing `content`")?;
            let resolved = commands::resolve_within_root(&root, path)?;
            if let Some(parent) = resolved.parent() {
                record_touched_dir(state, session_id, parent);
            }
            let old_content = std::fs::read_to_string(&resolved).unwrap_or_default();

            let detail = diff_text(&old_content, &new_content);
            let approved =
                request_permission(app, state, "edit", format!("Write {path}"), detail).await;
            if !approved {
                return Ok("The user denied permission to write this file.".into());
            }
            if let Some(parent) = resolved.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::write(&resolved, &new_content).map_err(|e| e.to_string())?;
            Ok(format!("Wrote {} bytes to {}", new_content.len(), path))
        }
        "shell" => {
            let command = args
                .get("command")
                .and_then(|v| v.as_str())
                .ok_or("missing `command`")?;
            let approved =
                request_permission(app, state, "shell", "Run shell command".into(), command.into())
                    .await;
            if !approved {
                return Ok("The user denied permission to run this command.".into());
            }
            run_shell(command, &root).await
        }
        "load_skill" => {
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
            match context::load_skill_body(&root, &touched, name) {
                Some(body) => Ok(body),
                None => {
                    let available: Vec<String> = context::list_skills(&root, &touched)
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
        other => Err(format!("unknown tool `{other}`")),
    }
}

async fn run_shell(command: &str, cwd: &PathBuf) -> Result<String, String> {
    let output = tokio::time::timeout(
        Duration::from_secs(30),
        tokio::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .current_dir(cwd)
            .output(),
    )
    .await
    .map_err(|_| "command timed out after 30s".to_string())?
    .map_err(|e| e.to_string())?;

    let mut combined = String::new();
    combined.push_str(&String::from_utf8_lossy(&output.stdout));
    if !output.stderr.is_empty() {
        combined.push_str("\n[stderr]\n");
        combined.push_str(&String::from_utf8_lossy(&output.stderr));
    }
    combined.push_str(&format!("\n[exit code: {}]", output.status.code().unwrap_or(-1)));
    Ok(truncate(combined))
}

#[tauri::command]
pub fn respond_permission(state: State<AppState>, id: String, approved: bool) -> Result<(), String> {
    if let Some(tx) = state.pending_permissions.lock().unwrap().remove(&id) {
        let _ = tx.send(approved);
        Ok(())
    } else {
        Err("no such permission request".into())
    }
}
