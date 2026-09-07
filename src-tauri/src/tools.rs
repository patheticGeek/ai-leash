use crate::chat;
use crate::commands::{self, IGNORED_NAMES};
use crate::context;
use crate::provider::ProviderConfig;
use crate::state::AppState;
use ignore::WalkBuilder;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use similar::{ChangeTag, TextDiff};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
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

pub fn tool_definitions(root: Option<&Path>, touched_dirs: &[PathBuf], allow_subtasks: bool) -> Value {
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

    if allow_subtasks {
        if let Value::Array(arr) = &mut tools {
            arr.push(json!({
                "type": "function",
                "function": {
                    "name": "spawn_sub_agent",
                    "description": "Delegate one or more self-contained subtasks to fresh sub-agents, each with its own isolated context and the same tools (except spawn_sub_agent itself, so they can't spawn further sub-agents). If the request has multiple independent parts, list them all in `tasks` — they run concurrently, which is faster than doing them one at a time. If it's a single simple thing, or its parts depend on each other's results, either pass just one entry or don't call this at all and handle it yourself. You will only see each subtask's final result, not its intermediate steps.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "tasks": {
                                "type": "array",
                                "description": "One entry per independent subtask to run concurrently",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "description": { "type": "string", "description": "Short (3-6 word) label for this subtask, shown to the user" },
                                        "prompt": { "type": "string", "description": "Full, self-contained instructions for the sub-agent" }
                                    },
                                    "required": ["description", "prompt"]
                                }
                            },
                            "interrupt": {
                                "type": "string",
                                "enum": ["all", "each"],
                                "description": "Only matters when `tasks` has more than one entry. \"all\" (default): wait for every subtask and see all results together in this same turn. \"each\": get the first subtask's result right away in this turn while the rest keep running; you'll automatically get a new turn to react as each remaining one finishes, without the user needing to say anything. Use \"each\" when you'd genuinely want to act on or mention a result as soon as it's ready rather than waiting for the slowest subtask."
                            }
                        },
                        "required": ["tasks"]
                    }
                }
            }));
        }
    }
    tools
}

pub(crate) async fn request_permission(
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

#[allow(clippy::too_many_arguments)]
pub async fn execute_tool(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    call_id: Option<&str>,
    provider: &ProviderConfig,
    model: &str,
    cancel_flag: &Arc<AtomicBool>,
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
        "spawn_sub_agent" => {
            const TASK_SHAPE_HINT: &str = "Each entry in `tasks` must be an object with exactly two string fields: `description` (a short label) and `prompt` (full self-contained instructions for the sub-agent). Example: {\"tasks\": [{\"description\": \"count rs files\", \"prompt\": \"Count how many .rs files exist in the project and report the number.\"}]}. Retry the `spawn_sub_agent` call with that exact shape.";

            let tasks = args
                .get("tasks")
                .and_then(|v| v.as_array())
                .filter(|a| !a.is_empty())
                .ok_or_else(|| format!("missing or empty `tasks`. {TASK_SHAPE_HINT}"))?;
            let interrupt_each = args.get("interrupt").and_then(|v| v.as_str()) == Some("each");

            let mut specs = Vec::with_capacity(tasks.len());
            for t in tasks {
                // Small/local models calling this schema sometimes reach for
                // familiar chat-message field names (`content`/`text`/`role`)
                // instead of `prompt`/`description` — accept the common
                // aliases rather than failing on an otherwise-correct call.
                let description = t
                    .get("description")
                    .or_else(|| t.get("title"))
                    .or_else(|| t.get("name"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let prompt = t
                    .get("prompt")
                    .or_else(|| t.get("content"))
                    .or_else(|| t.get("text"))
                    .or_else(|| t.get("instructions"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| format!("a `tasks` entry is missing `prompt`. {TASK_SHAPE_HINT}"))?;
                // If the model omitted a real description, derive a short,
                // distinguishable one from the prompt itself rather than
                // labeling every subtask identically as "Subtask".
                let description = description.unwrap_or_else(|| {
                    let words: Vec<&str> = prompt.split_whitespace().take(6).collect();
                    let mut label = words.join(" ");
                    if label.len() > 40 {
                        label.truncate(40);
                    }
                    if label.is_empty() {
                        "Subtask".to_string()
                    } else {
                        label
                    }
                });
                let sub_session_id = format!("{session_id}::spawn_sub_agent::{}", Uuid::new_v4());

                let _ = app.emit(
                    &format!("chat://{session_id}/subtask_start"),
                    json!({
                        "callId": call_id,
                        "subSessionId": sub_session_id,
                        "description": description,
                    }),
                );
                specs.push((description, prompt, sub_session_id));
            }

            if !interrupt_each || specs.len() == 1 {
                let jobs = specs.into_iter().map(|(description, prompt, sub_session_id)| async move {
                    let result = chat::run_sub_agent(
                        app,
                        state,
                        session_id,
                        &sub_session_id,
                        &prompt,
                        provider,
                        model,
                        cancel_flag,
                    )
                    .await;
                    (description, result.unwrap_or_else(|e| format!("Error: {e}")))
                });
                let results = futures_util::future::join_all(jobs).await;
                return Ok(results
                    .into_iter()
                    .map(|(description, text)| format!("## {description}\n\n{text}"))
                    .collect::<Vec<_>>()
                    .join("\n\n---\n\n"));
            }

            // interrupt = "each": run the first inline so this tool call has
            // a concrete result to return right away. The rest continue in
            // a detached background task; each one autonomously resumes the
            // conversation (a brand new turn, not triggered by the user) as
            // it finishes — see `chat::resume_after_background_subtask`.
            let mut iter = specs.into_iter();
            let (first_description, first_prompt, first_sub_id) = iter.next().unwrap();
            let remaining: Vec<_> = iter.collect();
            let remaining_count = remaining.len();

            let first_result = chat::run_sub_agent(
                app,
                state,
                session_id,
                &first_sub_id,
                &first_prompt,
                provider,
                model,
                cancel_flag,
            )
            .await
            .unwrap_or_else(|e| format!("Error: {e}"));

            if !remaining.is_empty() {
                let app_owned = app.clone();
                let session_id_owned = session_id.to_string();
                let provider_owned = provider.clone();
                let model_owned = model.to_string();
                tokio::spawn(async move {
                    for (description, prompt, sub_session_id) in remaining {
                        let state = app_owned.state::<AppState>();
                        let cancel_flag = Arc::new(AtomicBool::new(false));
                        let result = chat::run_sub_agent(
                            &app_owned,
                            &state,
                            &session_id_owned,
                            &sub_session_id,
                            &prompt,
                            &provider_owned,
                            &model_owned,
                            &cancel_flag,
                        )
                        .await
                        .unwrap_or_else(|e| format!("Error: {e}"));

                        chat::resume_after_background_subtask(
                            app_owned.clone(),
                            session_id_owned.clone(),
                            provider_owned.clone(),
                            model_owned.clone(),
                            description,
                            result,
                        )
                        .await;
                    }
                });
            }

            Ok(format!(
                "## {first_description}\n\n{first_result}\n\n({remaining_count} more subtask(s) still running in the background — you'll automatically get a turn to respond to each as it finishes)"
            ))
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
