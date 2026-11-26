//! `chat_info`: this chat's current facts, read fresh — the guidance's
//! "This chat" section is a snapshot (per turn natively, per connection
//! over the MCP bridge), so after a long run or a compaction the agent can
//! re-check its task's status, branch, and whether the project chat still
//! follows it. Offered to every chat kind, natively (`tools::execute_tool`)
//! and over the bridge, which relays it to the app (`mcp_bridge::server`)
//! because its `CHAT_CONTEXT_ENV` snapshot can't see later changes.

use crate::chat_context::{AgentBackend, ChatContext, ChatKind};
use crate::db::{self, Db};
use serde_json::{json, Value};
use std::path::Path;

pub fn chat_info_def() -> Value {
    json!({
        "name": "chat_info",
        "description": "This chat's current facts, read live: what kind of chat it is, its project, its task's number, title and status, branch and worktree, whether the project chat follows it or the user has taken it over, and the agent and model. Call it to re-check after a long run or a compaction instead of trusting what you were told at the start.",
        "parameters": { "type": "object", "properties": {}, "required": [] }
    })
}

/// What `chat_info` reports beyond the `ChatContext`: the facts that change
/// while a chat runs.
#[derive(Debug, Default, PartialEq)]
struct Live {
    /// A task chat's board status (`in_progress`, `review`, …).
    task_status: Option<String>,
    /// A task chat: whether the project chat is woken by its updates.
    followed: Option<bool>,
    /// The conversation row's backend blob, model and effort.
    backend: Option<String>,
    model: Option<String>,
    effort: Option<String>,
}

/// `session_id`'s facts, loaded now. `backend` is the kind of agent asking.
pub fn chat_info(db: &Db, session_id: &str, root: &Path, backend: AgentBackend) -> String {
    let ctx = ChatContext::load(db, session_id, root, backend);
    let task = match ctx.kind {
        ChatKind::Task { .. } => db::task_for_conversation(db, session_id),
        _ => None,
    };
    let row = db::get_conversation(db, session_id);
    let live = Live {
        task_status: task.as_ref().map(|t| t.status.clone()),
        followed: task.as_ref().map(|t| t.engaged_with_project),
        backend: row.as_ref().and_then(|c| c.backend.clone()),
        model: row.as_ref().and_then(|c| c.model.clone()),
        effort: row.as_ref().and_then(|c| c.effort.clone()),
    };
    render(&ctx, &live)
}

fn render(ctx: &ChatContext, live: &Live) -> String {
    let mut lines = vec![];
    let kind = match &ctx.kind {
        ChatKind::Plain => "plain chat (no role on the board)".to_string(),
        ChatKind::Project => "the project chat (beside the board)".to_string(),
        ChatKind::Task { number, title, .. } => format!("task chat of #{number}, *{title}*"),
        ChatKind::SubAgent { parent } => format!("sub-agent of chat `{parent}`"),
    };
    lines.push(format!("- Kind: {kind}"));
    lines.push(format!(
        "- Project: {} (`{}`)",
        ctx.project_name, ctx.project_root
    ));
    if let Some(status) = &live.task_status {
        lines.push(format!("- Task status: {}", status.replace('_', " ")));
    }
    match &ctx.kind {
        ChatKind::Task {
            branch,
            worktree_path,
            ..
        } => {
            lines.push(format!(
                "- Branch: {}",
                branch
                    .as_deref()
                    .map(|b| format!("`{b}`"))
                    .unwrap_or_else(|| "none (detached HEAD or not git)".into())
            ));
            lines.push(format!(
                "- Worktree: {}",
                worktree_path
                    .as_deref()
                    .map(|w| format!("`{w}`"))
                    .unwrap_or_else(|| "none (the project's main checkout)".into())
            ));
        }
        _ => lines.push(format!("- Working in: `{}`", ctx.checkout)),
    }
    if let Some(followed) = live.followed {
        lines.push(if followed {
            "- Followed by the project chat: yes; your turn's last reply is forwarded to it."
                .to_string()
        } else {
            "- Followed by the project chat: no; the user has taken this chat over (or started it themselves), so nothing is forwarded. Use `send_message` to \"project\" to reach it.".to_string()
        });
    }
    lines.push(format!("- Agent: {}", agent(ctx.backend, live)));
    lines.join("\n")
}

/// "ACP agent `claude-code`, model `x`, effort `high`" from the row's
/// backend blob (`{"kind":"acp","acpId":…}` / `{"kind":"builtin",
/// "providerId":…}`), falling back to the kind asking.
fn agent(backend: AgentBackend, live: &Live) -> String {
    let blob: Value = live
        .backend
        .as_deref()
        .and_then(|b| serde_json::from_str(b).ok())
        .unwrap_or(Value::Null);
    let id = |key: &str| blob.get(key).and_then(Value::as_str).map(str::to_string);
    let mut out = match (backend, id("acpId"), id("providerId")) {
        (AgentBackend::Acp, Some(acp), _) => format!("ACP agent `{acp}`"),
        (AgentBackend::Acp, None, _) => "an ACP agent".to_string(),
        (AgentBackend::Native, _, Some(provider)) => format!("native, provider `{provider}`"),
        (AgentBackend::Native, _, None) => "native".to_string(),
    };
    if let Some(model) = live.model.as_deref().filter(|m| !m.is_empty()) {
        out.push_str(&format!(", model `{model}`"));
    }
    if let Some(effort) = live.effort.as_deref().filter(|e| !e.is_empty()) {
        out.push_str(&format!(", effort `{effort}`"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat::ChatMessage;
    use crate::db::{
        create_task, ensure_project_chat, record_sub_agent_started, save_message,
        set_conversation_backend, set_conversation_worktree, set_task_conversation,
        set_task_engaged, update_task, NewTask, TaskPatch,
    };

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        Db::open(path)
    }

    fn say(db: &Db, id: &str) {
        let message = ChatMessage {
            role: "user".into(),
            content: "hi".into(),
            tool_calls: None,
        };
        save_message(db, id, "/proj/demo", &message);
    }

    fn info(db: &Db, id: &str, backend: AgentBackend) -> String {
        chat_info(db, id, Path::new("/elsewhere"), backend)
    }

    #[test]
    fn reports_each_kind_for_each_backend() {
        let db = temp_db();
        say(&db, "plain");
        let project = ensure_project_chat(&db, "/proj/demo");
        let task = create_task(
            &db,
            "/proj/demo",
            NewTask {
                title: "Fix it".into(),
                ..Default::default()
            },
        )
        .unwrap();
        say(&db, "task-chat");
        set_task_conversation(&db, &task.id, Some("task-chat"), true);
        set_conversation_worktree(&db, "task-chat", "/proj/demo", Some("/nowhere/wt"));
        record_sub_agent_started(&db, "sub", "task-chat", "look around", "m", None);

        for backend in [AgentBackend::Native, AgentBackend::Acp] {
            let text = info(&db, "plain", backend);
            assert!(text.contains("- Kind: plain chat"), "{text}");
            assert!(text.contains("- Project: demo (`/proj/demo`)"), "{text}");
            assert!(text.contains("- Working in: `/proj/demo`"), "{text}");
            assert!(!text.contains("Followed"), "{text}");

            let text = info(&db, &project, backend);
            assert!(text.contains("- Kind: the project chat"), "{text}");
            assert!(!text.contains("Task status"), "{text}");

            let text = info(&db, "task-chat", backend);
            assert!(
                text.contains(&format!("- Kind: task chat of #{}, *Fix it*", task.number)),
                "{text}"
            );
            assert!(
                text.contains(&format!("- Task status: {}", task.status.replace('_', " "))),
                "{text}"
            );
            assert!(text.contains("- Worktree: `/nowhere/wt`"), "{text}");
            assert!(text.contains("- Branch: none"), "{text}");
            assert!(text.contains("Followed by the project chat: yes"), "{text}");

            let text = info(&db, "sub", backend);
            assert!(
                text.contains("- Kind: sub-agent of chat `task-chat`"),
                "{text}"
            );
            assert!(text.contains("- Working in: `/nowhere/wt`"), "{text}");
            assert!(text.contains("model `m`"), "{text}");
        }
    }

    #[test]
    fn reads_live_status_follow_state_and_agent() {
        let db = temp_db();
        let task = create_task(
            &db,
            "/proj/demo",
            NewTask {
                title: "Fix it".into(),
                ..Default::default()
            },
        )
        .unwrap();
        say(&db, "task-chat");
        set_task_conversation(&db, &task.id, Some("task-chat"), true);
        assert_ne!(task.status, "review");

        // Changed after the chat started: the tool sees it.
        update_task(
            &db,
            &task.id,
            TaskPatch {
                status: Some("review".into()),
                ..Default::default()
            },
        )
        .unwrap();
        set_task_engaged(&db, &task.id, false);
        set_conversation_backend(
            &db,
            "task-chat",
            "/proj/demo",
            r#"{"kind":"acp","acpId":"claude-code"}"#,
            Some("opus"),
            Some("high"),
            None,
        );
        let text = info(&db, "task-chat", AgentBackend::Acp);
        assert!(text.contains("- Task status: review"), "{text}");
        assert!(text.contains("Followed by the project chat: no"), "{text}");
        assert!(text.contains("taken this chat over"), "{text}");
        assert!(
            text.contains("- Agent: ACP agent `claude-code`, model `opus`, effort `high`"),
            "{text}"
        );

        set_conversation_backend(
            &db,
            "task-chat",
            "/proj/demo",
            r#"{"kind":"builtin","providerId":"ollama"}"#,
            Some("qwen3"),
            None,
            None,
        );
        let text = info(&db, "task-chat", AgentBackend::Native);
        assert!(
            text.contains("- Agent: native, provider `ollama`, model `qwen3`"),
            "{text}"
        );
    }
}
