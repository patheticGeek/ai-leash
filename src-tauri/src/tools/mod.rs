mod action_tools;
mod fs_tools;
mod memory_tools;
// `pub(crate)` (not private): `lib.rs`'s `tauri::generate_handler!` list needs
// to name `respond_permission`/`set_permission_mode`/`run_shell_command` by
// their defining module path — the command macro's hidden per-command
// registration item lives next to the function itself, so a `pub use`
// re-export from here isn't enough for the macro to find it.
pub(crate) mod permissions;
mod schema;
pub(crate) mod shell_tools;
mod sub_agent_tools;

use crate::commands;
use crate::provider::ProviderConfig;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use similar::{ChangeTag, TextDiff};
use tauri::{AppHandle, State};

pub(crate) use permissions::request_permission;
pub use schema::tool_definitions;

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

pub(crate) const MAX_TOOL_OUTPUT: usize = 20_000;
pub(crate) const DEFAULT_READ_LIMIT: usize = 2000;

pub(crate) fn truncate(mut s: String) -> String {
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
pub(crate) fn paginate_lines(
    content: &str,
    offset: u64,
    limit: usize,
    label: &str,
    retry_hint: &str,
) -> String {
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
pub(crate) fn fix_literal_escapes(s: &str) -> String {
    if s.contains('\n') || !s.contains("\\n") {
        return s.to_string();
    }
    s.replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
}

pub(crate) fn diff_text(old: &str, new: &str) -> String {
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
        "read_file" => fs_tools::read_file(state, session_id, &root, args),
        "list_dir" => fs_tools::list_dir(state, session_id, &root, args),
        "grep" => fs_tools::grep(state, session_id, &root, args),
        "edit_file" => fs_tools::edit_file(app, state, session_id, &root, args).await,
        "write_file" => fs_tools::write_file(app, state, session_id, &root, args).await,
        "update_memory" => memory_tools::update_memory(app, state, session_id, &root, args).await,
        "shell" => shell_tools::shell(app, state, session_id, &root, args).await,
        "spawn_sub_agent" => {
            sub_agent_tools::spawn_sub_agent(app, state, session_id, call_id, provider, model, args)
        }
        "list_sub_agents" => sub_agent_tools::list_sub_agents(state, session_id),
        "read_sub_agent" => sub_agent_tools::read_sub_agent(state, session_id, args),
        "load_skill" => memory_tools::load_skill(state, session_id, &root, args),
        "create_action" => action_tools::create_action(app, state, session_id, &root, args).await,
        "run_action" => action_tools::run_action(app, &root, args),
        "stop_action" => action_tools::stop_action(app, &root, args),
        "list_actions" => action_tools::list_actions(app, &root),
        "read_action" => action_tools::read_action(app, &root, args),
        other => Err(format!("unknown tool `{other}`")),
    }
}
