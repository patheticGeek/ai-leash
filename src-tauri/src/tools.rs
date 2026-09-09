use crate::chat;
use crate::commands::{self, IGNORED_NAMES};
use crate::context;
use crate::db;
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
#[serde(rename_all = "camelCase")]
struct PermissionRequest {
    id: String,
    /// Which project (or sub-agent — see `permissionForSession` in
    /// `store.ts`) this came from, so the frontend can route the popover to
    /// the right `ChatPanel` and glow the right sidebar row instead of
    /// showing one global modal for every project at once.
    session_id: String,
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
                "name": "update_memory",
                "description": "Add to or update your persistent memory notes, which are shown back to you under \"# Project memory\" / \"# Global memory\" in the system prompt at the start of every future session. Use this for durable facts worth remembering across conversations (user preferences, project conventions, ongoing context) — not scratch state for the current task. Pass the complete new contents for the given scope, not just an addition: this replaces the whole file, and you can see its current contents (if any) already in your system prompt.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "scope": { "type": "string", "enum": ["project", "global"], "description": "\"project\" for notes specific to this project only, \"global\" for notes that should apply across all projects" },
                        "content": { "type": "string", "description": "The complete new markdown contents of the memory file for this scope" }
                    },
                    "required": ["scope", "content"]
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
                    "description": "Delegate one or more self-contained subtasks to fresh sub-agents, each with its own isolated context and the same tools (except spawn_sub_agent itself, so they can't spawn further sub-agents). If the request has multiple independent parts, list them all in `tasks` — they run concurrently, which is faster than doing them one at a time. If it's a single simple thing, or its parts depend on each other's results, either pass just one entry or don't call this at all and handle it yourself. This call returns immediately once the sub-agent(s) are spawned, without waiting for any of them to finish — each one's result is appended to this conversation as its own turn as soon as it's ready, and you'll automatically get a chance to react, without the user needing to say anything. Use `list_sub_agents`/`read_sub_agent` if you need to check on one proactively instead of waiting.",
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
                            }
                        },
                        "required": ["tasks"]
                    }
                }
            }));
            arr.push(json!({
                "type": "function",
                "function": {
                    "name": "list_sub_agents",
                    "description": "List the sub-agents you've spawned via spawn_sub_agent (running and finished), most recent first. Use this to check progress, or to find a sub_session_id for read_sub_agent.",
                    "parameters": { "type": "object", "properties": {}, "required": [] }
                }
            }));
            arr.push(json!({
                "type": "function",
                "function": {
                    "name": "read_sub_agent",
                    "description": "Read the full prompt and transcript (including tool calls and the final result) of one sub-agent you spawned, by its sub_session_id. For long transcripts, prefer offset/limit over reading it all at once.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "sub_session_id": { "type": "string", "description": "The sub-agent's session id, from list_sub_agents" },
                            "offset": { "type": "integer", "description": "1-based line number to start reading from. Omit to start at line 1." },
                            "limit": { "type": "integer", "description": "Maximum number of lines to return. Defaults to 2000." }
                        },
                        "required": ["sub_session_id"]
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
    session_id: &str,
    kind: &str,
    title: String,
    detail: String,
) -> bool {
    if state.permission_bypass.lock().unwrap().contains(session_id) {
        return true;
    }
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
            session_id: session_id.to_string(),
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

/// 1-based line-range windowing shared by `read_file` and `read_sub_agent` —
/// same semantics either way: a trailing `[showing lines A-B of N in
/// <label>; call <retry_hint> with offset=B+1 to continue]` note whenever the
/// returned range doesn't cover the whole thing.
fn paginate_lines(content: &str, offset: u64, limit: usize, label: &str, retry_hint: &str) -> String {
    let total_lines = content.lines().count();
    let offset = offset.max(1) as usize;
    let start_idx = offset - 1;
    if start_idx >= total_lines && total_lines > 0 {
        return format!("{label} has only {total_lines} lines; offset {offset} is beyond the end.");
    }

    let selected: Vec<&str> = content.lines().skip(start_idx).take(limit).collect();
    let end_line = start_idx + selected.len();
    let mut out = selected.join("\n");
    if start_idx > 0 || end_line < total_lines {
        out.push_str(&format!(
            "\n\n[showing lines {offset}-{end_line} of {total_lines} in {label}; call {retry_hint} with offset={} to continue]",
            end_line + 1,
        ));
    }
    out
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

/// Resolves whatever a model passed as `sub_session_id` (`read_sub_agent`)
/// to one of this session's actual sub-agent ids — full ids look like
/// `{parent_session_id}::spawn_sub_agent::{uuid}`, and `parent_session_id`
/// is often a whole project path, so the full id can run 60-100+ chars.
/// Models asked to reproduce that exactly are prone to paraphrasing it —
/// dropping the prefix, or truncating the middle with `...`/`??`/`…` — so
/// this tries progressively looser matches, scoped to this session's own
/// sub-agents only (never another session's):
///   1. The exact id as given.
///   2. Just the trailing UUID, missing the `{parent}::spawn_sub_agent::` prefix.
///   3. A truncated/elided fragment (trailing `.`/`?`/`…` stripped), matched
///      by substring against this session's sub-agent ids — only if that
///      leaves exactly one candidate and the fragment is long enough
///      (>= 6 chars) to not match by coincidence.
fn resolve_sub_agent_id(db: &db::Db, session_id: &str, given: &str) -> Option<String> {
    let expected_prefix = format!("{session_id}::spawn_sub_agent::");
    if given.starts_with(&expected_prefix) && db::get_sub_agent(db, given).is_some() {
        return Some(given.to_string());
    }
    let reconstructed = format!("{expected_prefix}{given}");
    if db::get_sub_agent(db, &reconstructed).is_some() {
        return Some(reconstructed);
    }
    let cleaned = given.trim_end_matches(['.', '?', '…', ' ']);
    if cleaned.len() < 6 {
        return None;
    }
    let mut candidates = db::list_sub_agents_for_parent(db, session_id, 500)
        .into_iter()
        .filter(|s| s.id.contains(cleaned));
    let first = candidates.next()?;
    if candidates.next().is_some() {
        return None; // ambiguous — let the caller ask for `list_sub_agents`
    }
    Some(first.id)
}

#[allow(clippy::too_many_arguments)]
pub async fn execute_tool(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    call_id: Option<&str>,
    provider: &ProviderConfig,
    model: &str,
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

            let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(1);
            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or(DEFAULT_READ_LIMIT);

            Ok(truncate(paginate_lines(&content, offset, limit, path, "read_file again")))
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
                request_permission(app, state, session_id, "edit", format!("Edit {path}"), detail)
                    .await;
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
        "update_memory" => {
            let scope = args
                .get("scope")
                .and_then(|v| v.as_str())
                .ok_or("missing `scope`")?;
            let global = match scope {
                "project" => false,
                "global" => true,
                other => return Err(format!("invalid `scope` {other:?}, expected \"project\" or \"global\"")),
            };
            let new_content = args
                .get("content")
                .and_then(|v| v.as_str())
                .map(fix_literal_escapes)
                .ok_or("missing `content`")?;
            let path = context::memory_path(&root, global)
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
            Ok(format!("Updated {scope} memory ({} bytes)", new_content.len()))
        }
        "shell" => {
            let command = args
                .get("command")
                .and_then(|v| v.as_str())
                .ok_or("missing `command`")?;
            let approved = request_permission(
                app,
                state,
                session_id,
                "shell",
                "Run shell command".into(),
                command.into(),
            )
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
                // Inherit the parent's bypass setting — same reasoning as
                // sharing its cancellation flag (see `run_sub_agent`'s doc
                // comment in chat.rs): a sub-agent has no textarea of its
                // own to show a permission popover above anyway.
                {
                    let mut bypass_set = state.permission_bypass.lock().unwrap();
                    if bypass_set.contains(session_id) {
                        bypass_set.insert(sub_session_id.clone());
                    }
                }

                db::record_sub_agent_started(&state.db, &sub_session_id, session_id, &description, &prompt);
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

            // Every sub-agent always runs fully detached — this call never
            // waits on any of them. Each independently records its own
            // finish and autonomously resumes the parent conversation (a
            // brand new turn, not triggered by the user) as soon as it's
            // ready — see `chat::resume_after_background_subtask`. Each gets
            // its own fresh cancel flag rather than sharing the parent's,
            // since nothing here awaits them together anymore.
            let count = specs.len();
            let labels: Vec<String> = specs.iter().map(|(d, _, _)| d.clone()).collect();

            for (description, prompt, sub_session_id) in specs {
                let app_owned = app.clone();
                let session_id_owned = session_id.to_string();
                let provider_owned = provider.clone();
                let model_owned = model.to_string();
                tokio::spawn(async move {
                    let state = app_owned.state::<AppState>();
                    let cancel_flag = Arc::new(AtomicBool::new(false));
                    let outcome = chat::run_sub_agent(
                        &app_owned,
                        &state,
                        &session_id_owned,
                        &sub_session_id,
                        &prompt,
                        &provider_owned,
                        &model_owned,
                        &cancel_flag,
                    )
                    .await;
                    let (status, result) = match outcome {
                        Ok(text) => ("done", text),
                        Err(e) => ("error", format!("Error: {e}")),
                    };
                    db::record_sub_agent_finished(&state.db, &sub_session_id, status, &result);
                    chat::resume_after_background_subtask(
                        app_owned,
                        session_id_owned,
                        provider_owned,
                        model_owned,
                        sub_session_id,
                        description,
                        result,
                    )
                    .await;
                });
            }

            Ok(format!(
                "Spawned {count} sub-agent(s): {}. Results will be appended to this chat as each finishes.",
                labels.join(", ")
            ))
        }
        "list_sub_agents" => {
            let items = db::list_sub_agents_for_parent(&state.db, session_id, 50);
            if items.is_empty() {
                return Ok("No sub-agents have been spawned by this session.".to_string());
            }
            let lines: Vec<String> = items
                .iter()
                .map(|s| {
                    let timing = match s.finished_at {
                        Some(f) => format!("finished (took {}s)", (f - s.started_at).max(0)),
                        None => "running".to_string(),
                    };
                    format!("{} [{}] {} — \"{}\"", s.id, s.status, timing, s.description)
                })
                .collect();
            Ok(truncate(lines.join("\n")))
        }
        "read_sub_agent" => {
            let given = args
                .get("sub_session_id")
                .and_then(|v| v.as_str())
                .ok_or("missing `sub_session_id`")?;
            let target = resolve_sub_agent_id(&state.db, session_id, given).ok_or_else(|| {
                format!("no sub-agent found matching {given:?}. Use list_sub_agents to see valid ids.")
            })?;
            // resolve_sub_agent_id only returns ids it already confirmed exist.
            let meta = db::get_sub_agent(&state.db, &target).expect("resolved sub-agent id exists");
            let messages = db::load_messages(&state.db, &target);
            let mut transcript = format!("Status: {}\n\nPrompt:\n{}\n", meta.status, meta.prompt);
            for (i, m) in messages.iter().enumerate() {
                if i == 0 && m.role == "user" {
                    continue; // already shown as "Prompt" above
                }
                transcript.push_str(&format!("\n### {}\n{}\n", m.role, m.content));
            }

            let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(1);
            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or(DEFAULT_READ_LIMIT);
            Ok(truncate(paginate_lines(&transcript, offset, limit, &target, "read_sub_agent again")))
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

/// The `!command` chat-input escape (see `ChatPanel.tsx`'s `send()`) — runs
/// `command` the same way the agent's own `shell` tool would, but skips
/// `request_permission` entirely: the user just typed it into their own
/// chat box, which *is* the approval, the same way a real shell doesn't ask
/// "are you sure?" before running what you typed. Recorded as a real
/// assistant-tool_call/tool message pair (not a bare injected message) so
/// it renders and persists exactly like an agent-issued `shell` call — see
/// `resume_after_background_subtask` in `chat.rs`, which uses the same
/// pattern for the same reason.
#[tauri::command]
pub async fn run_shell_command(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    command: String,
) -> Result<String, String> {
    let root = commands::get_root_path(state.inner())?;
    let result = run_shell(&command, &root).await.unwrap_or_else(|e| format!("Error: {e}"));

    let call_id = Uuid::new_v4().to_string();
    let arguments = json!({ "command": command });

    chat::push_message(
        &state,
        &session_id,
        chat::ChatMessage {
            role: "assistant".into(),
            content: String::new(),
            tool_calls: Some(vec![ToolCall {
                id: Some(call_id.clone()),
                function: ToolCallFunction { name: "shell".into(), arguments: arguments.clone() },
            }]),
        },
    );
    let _ = app.emit(
        &format!("chat://{session_id}/tool_call"),
        json!({ "id": call_id, "name": "shell", "arguments": arguments }),
    );

    chat::push_message(
        &state,
        &session_id,
        chat::ChatMessage { role: "tool".into(), content: result.clone(), tool_calls: None },
    );
    let _ = app.emit(
        &format!("chat://{session_id}/tool_result"),
        json!({ "id": call_id, "result": &result }),
    );

    Ok(result)
}

/// Resolves a pending request and lets every subscriber (not just whichever
/// `ChatPanel`/popover instance happened to call this — a sub-agent's
/// request is answered from its *parent* project's popover, see
/// `permissionForSession` in `store.ts`) know it's no longer pending, via
/// `permission://resolved`. Frontend state (`pendingPermissions` in
/// `store.ts`) is keyed by `sessionId`, not `id`, so the event only needs to
/// carry `id` — the store already knows how to find which session's entry
/// that belongs to.
#[tauri::command]
pub fn respond_permission(app: AppHandle, state: State<AppState>, id: String, approved: bool) -> Result<(), String> {
    if let Some(tx) = state.pending_permissions.lock().unwrap().remove(&id) {
        let _ = tx.send(approved);
        let _ = app.emit("permission://resolved", json!({ "id": id }));
        Ok(())
    } else {
        Err("no such permission request".into())
    }
}

/// Flips a session between "ask" (the default — every edit/shell/ACP
/// permission request goes through `request_permission`'s popover) and
/// "bypass" (auto-approved, no prompt at all) — see the Ask/Bypass selector
/// in `ChatPanel.tsx`, next to the model picker. Backend-only state (not
/// persisted to SQLite), so the frontend re-sends this once per session on
/// mount to restore whatever the user last chose (it persists that choice
/// itself, in localStorage).
#[tauri::command]
pub fn set_permission_mode(state: State<AppState>, session_id: String, bypass: bool) -> Result<(), String> {
    let mut bypass_set = state.permission_bypass.lock().unwrap();
    if bypass {
        bypass_set.insert(session_id);
    } else {
        bypass_set.remove(&session_id);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> db::Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", Uuid::new_v4()));
        db::Db::open(path)
    }

    fn start(db: &db::Db, parent: &str, uuid_suffix: &str) -> String {
        let id = format!("{parent}::spawn_sub_agent::{uuid_suffix}");
        db::record_sub_agent_started(db, &id, parent, "a task", "do it");
        id
    }

    #[test]
    fn resolves_the_exact_full_id() {
        let db = temp_db();
        let id = start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(resolve_sub_agent_id(&db, "/proj", &id), Some(id));
    }

    #[test]
    fn resolves_just_the_trailing_uuid() {
        let db = temp_db();
        let id = start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(
            resolve_sub_agent_id(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000"),
            Some(id)
        );
    }

    #[test]
    fn resolves_a_truncated_id_with_an_ellipsis() {
        let db = temp_db();
        let id = start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(resolve_sub_agent_id(&db, "/proj", "/proj::spawn_sub_agent::550e8400..."), Some(id));
    }

    #[test]
    fn resolves_a_truncated_id_with_double_question_marks() {
        let db = temp_db();
        let id = start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(resolve_sub_agent_id(&db, "/proj", "550e8400-e29b??"), Some(id));
    }

    #[test]
    fn refuses_to_guess_when_the_fragment_is_too_short() {
        let db = temp_db();
        start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(resolve_sub_agent_id(&db, "/proj", "550e?"), None);
    }

    #[test]
    fn refuses_to_guess_when_the_fragment_is_ambiguous() {
        let db = temp_db();
        start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        start(&db, "/proj", "550e8400-aaaa-41d4-a716-446655440000");
        assert_eq!(resolve_sub_agent_id(&db, "/proj", "550e8400..."), None);
    }

    #[test]
    fn never_resolves_another_sessions_sub_agent() {
        let db = temp_db();
        let id = start(&db, "/other", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(resolve_sub_agent_id(&db, "/proj", &id), None);
        assert_eq!(
            resolve_sub_agent_id(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000"),
            None
        );
    }
}
