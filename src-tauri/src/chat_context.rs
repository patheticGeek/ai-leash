//! What kind of chat a conversation is, for the guidance's "This chat"
//! section (`tools::guidance::guidance`): a project's board chat, a task's
//! chat, a sub-agent, or a plain chat. Built from the conversation row
//! (`role`, `task_id`, whether it has a `worktree_path`) plus the task and sub-agent tables,
//! so it's the same facts whether the native loop (`chat::agent_loop`)
//! rebuilds its system prompt or an ACP agent's MCP bridge is spawned
//! (`acp::discovery::mcp_servers_for`, which hands it over as JSON in
//! `mcp_bridge::CHAT_CONTEXT_ENV`).

use crate::db::{self, Db};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Which kind of agent reads the guidance. The native loop has AI Leash's
/// own file/shell tools; an ACP agent has its own and reaches AI Leash's
/// through the MCP bridge, so the tool rules differ.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentBackend {
    Native,
    Acp,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChatKind {
    /// A chat with no role on the board.
    Plain,
    /// The project's board chat (`role = 'project'`).
    Project,
    /// A board task's own chat. Whether it has its own worktree is
    /// `ChatContext::in_worktree`.
    Task { number: i64, title: String },
    /// A one-shot sub-agent; `parent` is the conversation that spawned it.
    SubAgent { parent: String },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChatContext {
    pub kind: ChatKind,
    pub backend: AgentBackend,
    pub project_name: String,
    pub project_root: String,
    /// Whether this chat works in a worktree of its own (a sub-agent: its
    /// parent's) rather than the project's main checkout. Only the fact is
    /// passed on, not the path or branch: the agent's working folder is the
    /// worktree, and `git branch` names the branch.
    pub in_worktree: bool,
}

impl ChatContext {
    /// Sub-agents don't get `spawn_sub_agent` and friends.
    pub fn allows_sub_agents(&self) -> bool {
        !matches!(self.kind, ChatKind::SubAgent { .. })
    }

    /// The context of `session_id`. `backend` is the agent actually running
    /// it (the row's stored backend is only the last one used).
    /// `fallback_root` is used when the row doesn't exist yet.
    pub fn load(db: &Db, session_id: &str, fallback_root: &Path, backend: AgentBackend) -> Self {
        let conversation = db::get_conversation(db, session_id);
        let project_root = conversation
            .as_ref()
            .map(|c| c.project_root.clone())
            .filter(|r| !r.is_empty())
            .unwrap_or_else(|| fallback_root.display().to_string());
        let worktree = conversation.as_ref().and_then(|c| c.worktree_path.clone());

        let (kind, worktree) = match conversation.as_ref().and_then(|c| c.role.as_deref()) {
            Some("project") => (ChatKind::Project, worktree),
            Some("sub-agent") => {
                let parent = db::sub_agent_parent(db, session_id).unwrap_or_default();
                // A sub-agent works in its parent's checkout.
                let checkout = db::conversation_worktree(db, &parent);
                (ChatKind::SubAgent { parent }, checkout)
            }
            _ => match db::task_for_conversation(db, session_id) {
                Some(task) => {
                    let kind = ChatKind::Task {
                        number: task.number,
                        title: task.title,
                    };
                    (kind, worktree)
                }
                None => (ChatKind::Plain, worktree),
            },
        };

        ChatContext {
            kind,
            backend,
            project_name: project_name(&project_root),
            in_worktree: worktree.is_some_and(|w| !w.is_empty() && w != project_root),
            project_root,
        }
    }
}

fn project_name(root: &str) -> String {
    Path::new(root)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .unwrap_or(root)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat::ChatMessage;
    use crate::db::{
        create_task, ensure_project_chat, record_sub_agent_started, save_message,
        set_conversation_worktree, set_task_conversation, NewTask,
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

    fn load(db: &Db, id: &str) -> ChatContext {
        ChatContext::load(db, id, Path::new("/elsewhere"), AgentBackend::Native)
    }

    #[test]
    fn a_new_chat_is_plain_in_the_fallback_root() {
        let ctx = load(&temp_db(), "missing");
        assert_eq!(ctx.kind, ChatKind::Plain);
        assert_eq!(ctx.project_root, "/elsewhere");
        assert_eq!(ctx.project_name, "elsewhere");
        assert!(!ctx.in_worktree);
    }

    #[test]
    fn reads_each_kind_from_the_rows() {
        let db = temp_db();
        say(&db, "plain");
        assert_eq!(load(&db, "plain").kind, ChatKind::Plain);
        assert_eq!(load(&db, "plain").project_name, "demo");

        let project = ensure_project_chat(&db, "/proj/demo");
        assert_eq!(load(&db, &project).kind, ChatKind::Project);

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
        set_task_conversation(&db, &task.id, Some("task-chat"), false);
        set_conversation_worktree(&db, "task-chat", "/proj/demo", Some("/nowhere/wt"));
        let ctx = load(&db, "task-chat");
        assert_eq!(
            ctx.kind,
            ChatKind::Task {
                number: task.number,
                title: "Fix it".into(),
            }
        );
        assert!(ctx.in_worktree);

        record_sub_agent_started(&db, "sub", "task-chat", "look around", "m", None);
        let ctx = load(&db, "sub");
        assert_eq!(
            ctx.kind,
            ChatKind::SubAgent {
                parent: "task-chat".into()
            }
        );
        assert!(ctx.in_worktree);
        assert!(!ctx.allows_sub_agents());
        assert!(!load(&db, &project).in_worktree);
    }

    #[test]
    fn round_trips_through_json() {
        let ctx = ChatContext {
            kind: ChatKind::Task {
                number: 3,
                title: "t".into(),
            },
            backend: AgentBackend::Acp,
            project_name: "p".into(),
            project_root: "/p".into(),
            in_worktree: true,
        };
        let json = serde_json::to_string(&ctx).unwrap();
        assert_eq!(serde_json::from_str::<ChatContext>(&json).unwrap(), ctx);
    }
}
