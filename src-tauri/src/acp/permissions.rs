use super::events::summarize_tool_call_content;
use crate::state::AppState;
use crate::tools;
use agent_client_protocol::schema::v1::{
    PermissionOption, PermissionOptionId, PermissionOptionKind, RequestPermissionOutcome,
    RequestPermissionRequest, SelectedPermissionOutcome, ToolKind,
};
use tauri::{AppHandle, Manager};

pub(super) async fn bridge_acp_permission(
    app: &AppHandle,
    session_id: &str,
    request: &RequestPermissionRequest,
) -> RequestPermissionOutcome {
    let fields = &request.tool_call.fields;
    let title = fields
        .title
        .clone()
        .unwrap_or_else(|| "ACP tool call".to_string());
    let content = fields.content.clone().unwrap_or_default();
    let summary = summarize_tool_call_content(&content);

    // An `execute` tool call is a command: show the command as the code and
    // the agent's own text (its description of what the command does) as the
    // reason — the same shape as a native shell request. Agents put the
    // command in `rawInput.command` and/or the title (often as a code span).
    let (kind, title, detail, reason) = if fields.kind == Some(ToolKind::Execute) {
        let command = execute_command(fields.raw_input.as_ref(), &title);
        let reason = (!content.is_empty())
            .then_some(summary)
            .filter(|r| !r.trim().is_empty());
        ("shell", "Run shell command".to_string(), command, reason)
    } else {
        ("acp", title, summary, None)
    };

    let state = app.state::<AppState>();
    let approved =
        tools::request_permission_with_reason(app, &state, session_id, kind, title, detail, reason)
            .await;

    match select_permission_option(&request.options, approved) {
        Some(option_id) => {
            RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(option_id))
        }
        None => RequestPermissionOutcome::Cancelled,
    }
}

/// The command of an `execute` tool call: `rawInput.command` when the agent
/// sends one (a string, or an argv array joined with spaces), else the title
/// with a surrounding Markdown code span (`` `cmd` ``) stripped.
fn execute_command(raw_input: Option<&serde_json::Value>, title: &str) -> String {
    let from_input = raw_input
        .and_then(|v| v.get("command"))
        .and_then(|c| match c {
            serde_json::Value::String(s) => Some(s.clone()),
            serde_json::Value::Array(a) => Some(
                a.iter()
                    .filter_map(|p| p.as_str())
                    .collect::<Vec<_>>()
                    .join(" "),
            ),
            _ => None,
        });
    from_input
        .filter(|c| !c.trim().is_empty())
        .unwrap_or_else(|| {
            let t = title.trim();
            t.strip_prefix('`')
                .and_then(|t| t.strip_suffix('`'))
                .unwrap_or(t)
                .to_string()
        })
}

/// Collapses ACP's multi-option permission request down to our existing
/// boolean approve/deny UI. Approve prefers `AllowOnce`, falls back to
/// `AllowAlways`, and — if the agent offers no Allow* option at all — falls
/// back to the first option offered. Deny always maps to `None` (the caller
/// turns that into `RequestPermissionOutcome::Cancelled`, a legitimate
/// protocol response), regardless of what options were offered.
fn select_permission_option(
    options: &[PermissionOption],
    approved: bool,
) -> Option<PermissionOptionId> {
    if !approved {
        return None;
    }
    options
        .iter()
        .find(|o| o.kind == PermissionOptionKind::AllowOnce)
        .or_else(|| {
            options
                .iter()
                .find(|o| o.kind == PermissionOptionKind::AllowAlways)
        })
        .or_else(|| options.first())
        .map(|o| o.option_id.clone())
}

#[cfg(test)]
mod tests {
    #[test]
    fn execute_command_prefers_raw_input() {
        let input = serde_json::json!({ "command": "npm run build", "description": "Build it" });
        assert_eq!(
            execute_command(Some(&input), "`npm run build`"),
            "npm run build"
        );
        let argv = serde_json::json!({ "command": ["git", "status"] });
        assert_eq!(execute_command(Some(&argv), "Run"), "git status");
    }

    #[test]
    fn execute_command_falls_back_to_the_title() {
        assert_eq!(execute_command(None, "`ls -la`"), "ls -la");
        assert_eq!(execute_command(None, "cargo test"), "cargo test");
        let empty = serde_json::json!({ "command": "" });
        assert_eq!(execute_command(Some(&empty), "`pwd`"), "pwd");
    }

    use super::*;

    fn option(id: &str, kind: PermissionOptionKind) -> PermissionOption {
        PermissionOption::new(id.to_string(), id.to_string(), kind)
    }

    #[test]
    fn prefers_allow_once_when_approved() {
        let options = vec![
            option("allow-always", PermissionOptionKind::AllowAlways),
            option("allow-once", PermissionOptionKind::AllowOnce),
        ];
        let picked = select_permission_option(&options, true).unwrap();
        assert_eq!(picked.to_string(), "allow-once");
    }

    #[test]
    fn falls_back_to_allow_always_when_no_allow_once() {
        let options = vec![option("allow-always", PermissionOptionKind::AllowAlways)];
        let picked = select_permission_option(&options, true).unwrap();
        assert_eq!(picked.to_string(), "allow-always");
    }

    #[test]
    fn falls_back_to_first_option_when_no_allow_kind_offered() {
        let options = vec![option("reject-once", PermissionOptionKind::RejectOnce)];
        let picked = select_permission_option(&options, true).unwrap();
        assert_eq!(picked.to_string(), "reject-once");
    }

    #[test]
    fn deny_always_maps_to_none() {
        let options = vec![option("allow-once", PermissionOptionKind::AllowOnce)];
        assert!(select_permission_option(&options, false).is_none());
    }
}
