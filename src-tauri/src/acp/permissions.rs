use super::events::summarize_tool_call_content;
use crate::state::AppState;
use crate::tools;
use agent_client_protocol::schema::v1::{
    PermissionOption, PermissionOptionId, PermissionOptionKind, RequestPermissionOutcome,
    RequestPermissionRequest, SelectedPermissionOutcome,
};
use tauri::{AppHandle, Manager};

pub(super) async fn bridge_acp_permission(
    app: &AppHandle,
    session_id: &str,
    request: &RequestPermissionRequest,
) -> RequestPermissionOutcome {
    let title = request
        .tool_call
        .fields
        .title
        .clone()
        .unwrap_or_else(|| "ACP tool call".to_string());
    let content = request.tool_call.fields.content.clone().unwrap_or_default();
    let detail = summarize_tool_call_content(&content);

    let state = app.state::<AppState>();
    let approved = tools::request_permission(app, &state, session_id, "acp", title, detail).await;

    match select_permission_option(&request.options, approved) {
        Some(option_id) => {
            RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(option_id))
        }
        None => RequestPermissionOutcome::Cancelled,
    }
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
