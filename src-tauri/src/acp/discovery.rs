use crate::mcp_bridge;
use crate::state::AppState;
use agent_client_protocol::schema::v1::{
    AvailableCommand, AvailableCommandInput, EnvVariable, McpServer, McpServerStdio,
    SessionConfigKind, SessionConfigOption, SessionConfigOptionCategory,
    SessionConfigSelectOptions,
};
use serde_json::json;
use tauri::{AppHandle, Manager};

/// Attaches AI Leash's own MCP bridge (see `mcp_bridge`) to a new ACP
/// session so it can delegate sub-agents and read/write memory notes —
/// empty if the bridge hasn't finished binding yet (`lib.rs`'s `.setup()`
/// hook) or `current_exe()` fails, in which case the session just proceeds
/// without those tools rather than failing to connect at all.
pub(super) fn mcp_servers_for(
    app: &AppHandle,
    session_id: &str,
    root: &std::path::Path,
) -> Vec<McpServer> {
    let Some(bridge) = app.state::<AppState>().mcp_bridge.lock().unwrap().clone() else {
        return Vec::new();
    };
    let Ok(exe) = std::env::current_exe() else {
        return Vec::new();
    };
    vec![McpServer::Stdio(
        McpServerStdio::new("ai-leash", exe)
            .args(vec!["--mcp-bridge".to_string()])
            .env(vec![
                EnvVariable::new(mcp_bridge::PORT_ENV, bridge.port.to_string()),
                EnvVariable::new(mcp_bridge::TOKEN_ENV, bridge.token),
                EnvVariable::new(mcp_bridge::SESSION_ID_ENV, session_id.to_string()),
                EnvVariable::new(mcp_bridge::PROJECT_ROOT_ENV, root.display().to_string()),
            ]),
    )]
}

/// ACP lets an agent advertise a "model" selector as one of its session
/// config options, but it's agent-defined and optional — most agents won't
/// have one. When present it's always a fixed list of choices (a `Select`),
/// never freeform text, so this is the only way a model can legitimately be
/// set for an ACP-backed session; there's no separate "type any model name"
/// path because the protocol doesn't support one.
pub(super) fn find_model_config_option(
    options: &[SessionConfigOption],
) -> Option<&SessionConfigOption> {
    options.iter().find(|o| {
        matches!(o.category, Some(SessionConfigOptionCategory::Model))
            && matches!(o.kind, SessionConfigKind::Select(_))
    })
}

pub(super) fn find_thought_level_config_option(
    options: &[SessionConfigOption],
) -> Option<&SessionConfigOption> {
    options.iter().find(|o| {
        matches!(o.category, Some(SessionConfigOptionCategory::ThoughtLevel))
            && matches!(o.kind, SessionConfigKind::Select(_))
    })
}

/// Flattens grouped options (`SessionConfigSelectOptions::Grouped`) into a
/// single list, dropping group headers — the frontend just needs a picker,
/// not nested categories.
pub(super) fn model_options_payload(option: &SessionConfigOption) -> serde_json::Value {
    let SessionConfigKind::Select(select) = &option.kind else {
        return json!(null);
    };
    let flat: Vec<serde_json::Value> = match &select.options {
        SessionConfigSelectOptions::Ungrouped(opts) => opts
            .iter()
            .map(|o| json!({ "value": o.value.to_string(), "name": o.name }))
            .collect(),
        SessionConfigSelectOptions::Grouped(groups) => groups
            .iter()
            .flat_map(|g| &g.options)
            .map(|o| json!({ "value": o.value.to_string(), "name": o.name }))
            .collect(),
        // `#[non_exhaustive]` for forward compatibility with the protocol —
        // nothing else is defined today.
        _ => vec![],
    };
    json!({
        "id": option.id.to_string(),
        "name": option.name,
        "currentValue": select.current_value.to_string(),
        "options": flat,
    })
}

pub(super) fn thought_level_options_payload(option: &SessionConfigOption) -> serde_json::Value {
    model_options_payload(option)
}

/// An agent can (re-)announce its slash commands at any point in a session
/// (typically once, right after `NewSessionRequest`, but nothing stops it
/// from changing the set mid-conversation — e.g. after `cd`-ing elsewhere),
/// which is why this rebuilds and re-emits the whole list rather than
/// diffing against a previous one. `input`'s `hint` (when present) is the
/// only shape ACP defines today — "all text typed after the command name is
/// passed through as-is" — so there's nothing structured to expose beyond
/// the placeholder text.
pub(super) fn available_commands_payload(commands: &[AvailableCommand]) -> serde_json::Value {
    let list: Vec<serde_json::Value> = commands
        .iter()
        .map(|c| {
            let hint = match &c.input {
                Some(AvailableCommandInput::Unstructured(u)) => Some(u.hint.clone()),
                // `#[non_exhaustive]` for forward compatibility with the
                // protocol — nothing else is defined today.
                Some(_) | None => None,
            };
            json!({ "name": c.name, "description": c.description, "hint": hint })
        })
        .collect();
    json!(list)
}

pub(super) fn format_acp_error(error: &agent_client_protocol::Error) -> String {
    let base = match &error.data {
        Some(serde_json::Value::String(s)) => format!("{}: {s}", error.message),
        Some(other) => format!("{}: {other}", error.message),
        None => error.message.clone(),
    };
    // The crate reports a failed spawn (bad command, or the binary genuinely
    // isn't reachable) as an opaque OS error buried in `data`, indistinguishable
    // from any other internal error at a glance. `os error 2` is ENOENT — the
    // executable itself couldn't be found, which is almost always either a
    // typo in the launch command or a PATH problem (npx/copilot installed via
    // something like nvm that only exposes it to interactive shells, which is
    // why `env::fix_path_env` exists — but it can't help if the command is
    // simply wrong).
    if base.contains("os error 2") || base.contains("No such file or directory") {
        format!(
            "{base}\n\nThe agent's launch command couldn't be found. Check for a typo, that it's \
             installed, and that it's on PATH — or use its full path instead of relying on PATH \
             lookup (Settings → Agent backend)."
        )
    } else {
        base
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn available_commands_payload_flattens_hint_and_omits_it_when_absent() {
        use agent_client_protocol::schema::v1::UnstructuredCommandInput;

        let commands = vec![
            AvailableCommand::new("create_plan", "Draft an implementation plan").input(
                AvailableCommandInput::Unstructured(UnstructuredCommandInput::new("<goal>")),
            ),
            AvailableCommand::new("research_codebase", "Explore the codebase"),
        ];
        let payload = available_commands_payload(&commands);
        assert_eq!(
            payload,
            json!([
                { "name": "create_plan", "description": "Draft an implementation plan", "hint": "<goal>" },
                { "name": "research_codebase", "description": "Explore the codebase", "hint": null },
            ])
        );
    }

    #[test]
    fn formats_error_with_string_data() {
        let err = agent_client_protocol::Error::new(-32000, "Internal error").data(
            serde_json::Value::String("Process exited with 1: boom".to_string()),
        );
        assert_eq!(
            format_acp_error(&err),
            "Internal error: Process exited with 1: boom"
        );
    }

    #[test]
    fn formats_error_without_data() {
        let err = agent_client_protocol::Error::new(-32000, "Internal error");
        assert_eq!(format_acp_error(&err), "Internal error");
    }

    #[test]
    fn appends_a_hint_for_a_failed_spawn() {
        let err = agent_client_protocol::Error::new(-32000, "Internal error").data(
            serde_json::json!({"spawned_at": "jsonrpc.rs:1931:39", "data": "No such file or directory (os error 2)"}),
        );
        let formatted = format_acp_error(&err);
        assert!(formatted.contains("No such file or directory (os error 2)"));
        assert!(formatted.contains("couldn't be found"));
    }

    #[test]
    fn does_not_hint_for_an_unrelated_error() {
        let err = agent_client_protocol::Error::new(-32000, "Internal error").data(
            serde_json::Value::String("Process exited with 1: boom".to_string()),
        );
        assert!(!format_acp_error(&err).contains("couldn't be found"));
    }
}
