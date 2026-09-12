//! `conversations` table access: the per-row upsert shared by every message
//! write (see `messages::save_message`/`start_streaming_message`), and
//! whole-conversation deletion, which cascades into `messages` and
//! `sub_agents` too — deleting a conversation isn't just a `conversations`
//! table op, so it lives here rather than being split across files.

use super::messages::title_from_message;
use super::Db;
use rusqlite::{params, Connection};
use serde::Serialize;

/// One row of `list_all_conversations` — everything the sidebar needs to
/// render a conversation without a second round trip.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub project_root: String,
    pub title: Option<String>,
    pub updated_at: i64,
}

/// Every top-level conversation across every known project — the
/// sidebar's own scope. Deliberately NOT filtered by whichever project is
/// currently "open" (`state.project_root` is a single global value — see
/// `commands::set_project_root` — but the sidebar must show every
/// project's conversations regardless of which one is currently active).
/// Excludes sub-agent conversations (id contains `::spawn_sub_agent::` —
/// see `tools::sub_agent_tools`), which have their own dedicated Sub
/// Agents sidebar (`list_all_sub_agents`) instead.
pub fn list_all_conversations(db: &Db) -> Vec<ConversationSummary> {
    let conn = db.0.lock().unwrap();
    let Ok(mut stmt) = conn.prepare(
        "SELECT id, project_root, title, updated_at FROM conversations \
         WHERE id NOT LIKE '%::spawn_sub_agent::%' ORDER BY updated_at DESC",
    ) else {
        return vec![];
    };
    stmt.query_map([], |row| {
        Ok(ConversationSummary {
            id: row.get(0)?,
            project_root: row.get(1)?,
            title: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })
    .map(|rows| rows.filter_map(Result::ok).collect())
    .unwrap_or_default()
}

/// Deletes one conversation outright — its own row plus its `messages` and
/// stored ACP session id. Distinct from `clear_conversation`: that wipes a
/// conversation's content but keeps its id alive for reuse (the "/clear"
/// command); this is "remove it from the sidebar for good" (a `RENAME`less
/// project can still be reused later since ids are minted fresh each time).
/// Deliberately does NOT cascade into sub-agents spawned from this
/// conversation (unlike `clear_conversation`) — a deleted top-level
/// conversation's sub-agent history is left as-is, same as any other
/// cross-project sub-agent history the Sub Agents sidebar owns
/// independently.
pub fn delete_conversation(db: &Db, conversation_id: &str) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "DELETE FROM messages WHERE conversation_id = ?1",
        params![conversation_id],
    );
    let _ = conn.execute(
        "DELETE FROM conversations WHERE id = ?1",
        params![conversation_id],
    );
    let _ = conn.execute(
        "DELETE FROM acp_agent_sessions WHERE conversation_id = ?1",
        params![conversation_id],
    );
}

/// Inserts a conversation's row if it doesn't exist yet, or bumps its
/// `updated_at` if it does. Called by both `messages::save_message` and
/// `messages::start_streaming_message` since every write to a conversation's
/// messages also touches its own `conversations` bookkeeping row.
pub(super) fn upsert_conversation(
    conn: &Connection,
    conversation_id: &str,
    project_root: &str,
    ts: i64,
) {
    let _ = conn.execute(
        "INSERT INTO conversations (id, project_root, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(id) DO UPDATE SET updated_at = ?3",
        params![conversation_id, project_root, ts],
    );
}

/// Returns the persisted title for a conversation, if one has been assigned.
pub fn get_conversation_title(db: &Db, conversation_id: &str) -> Option<String> {
    let conn = db.0.lock().unwrap();
    let title: Option<String> = conn
        .query_row(
            "SELECT title FROM conversations WHERE id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    let title = title?;
    // Upgrade titles written by the earlier implementation, which stored
    // the entire first prompt verbatim.
    let first_prompt: Option<String> = conn
        .query_row(
            "SELECT content FROM messages WHERE conversation_id = ?1 AND role = 'user' ORDER BY id ASC LIMIT 1",
            params![conversation_id],
            |row| row.get(0),
        )
        .ok();
    if first_prompt
        .as_deref()
        .is_some_and(|prompt| prompt.trim() == title)
    {
        if let Some(derived) = first_prompt.and_then(|prompt| title_from_message(&prompt)) {
            if derived != title {
                let _ = conn.execute(
                    "UPDATE conversations SET title = ?1 WHERE id = ?2",
                    params![&derived, conversation_id],
                );
                return Some(derived);
            }
        }
    }
    Some(title)
}

/// Sets or clears a conversation title without changing its activity order.
pub fn set_conversation_title(db: &Db, conversation_id: &str, title: Option<&str>) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "UPDATE conversations SET title = ?1 WHERE id = ?2",
        params![title, conversation_id],
    );
}

/// Wipes a conversation's transcript for the local "/clear" command (see
/// `chat::clear_conversation`) — deletes its `messages` rows and its own
/// `conversations` row, so `save_message`'s `ON CONFLICT` treats the next
/// message as starting a brand new conversation rather than updating a
/// leftover `updated_at`. Also deletes every `sub_agents` row this
/// conversation spawned, and *their* own `messages`/`conversations` rows
/// (each sub-agent's transcript is keyed by its own id as `conversation_id`,
/// same as any other session's) — otherwise they'd be orphaned rows the
/// Sub Agents sidebar still lists with no way back to the conversation that
/// spawned them. Sub-agents can't themselves spawn further sub-agents (one
/// level deep only — see `run_sub_agent` in chat.rs), so this never needs
/// to recurse.
pub fn clear_conversation(db: &Db, conversation_id: &str) {
    let conn = db.0.lock().unwrap();

    let sub_agent_ids: Vec<String> = conn
        .prepare("SELECT id FROM sub_agents WHERE parent_session_id = ?1")
        .and_then(|mut stmt| {
            stmt.query_map(params![conversation_id], |row| row.get(0))?
                .collect()
        })
        .unwrap_or_default();
    for sub_agent_id in &sub_agent_ids {
        let _ = conn.execute(
            "DELETE FROM messages WHERE conversation_id = ?1",
            params![sub_agent_id],
        );
        let _ = conn.execute(
            "DELETE FROM conversations WHERE id = ?1",
            params![sub_agent_id],
        );
        let _ = conn.execute(
            "DELETE FROM acp_agent_sessions WHERE conversation_id = ?1",
            params![sub_agent_id],
        );
    }
    let _ = conn.execute(
        "DELETE FROM sub_agents WHERE parent_session_id = ?1",
        params![conversation_id],
    );

    let _ = conn.execute(
        "DELETE FROM messages WHERE conversation_id = ?1",
        params![conversation_id],
    );
    let _ = conn.execute(
        "DELETE FROM conversations WHERE id = ?1",
        params![conversation_id],
    );
    // Also drop any stored agent-native session id for this conversation (see
    // `acp_sessions.rs`) — otherwise `/clear` only wipes our own transcript
    // while the next connection's `session/load` resumes the same ACP
    // session, and the agent still remembers everything from before the
    // clear. Not scoped by `launch_command` since this conversation may have
    // switched agents over its lifetime and all of them should be forgotten.
    let _ = conn.execute(
        "DELETE FROM acp_agent_sessions WHERE conversation_id = ?1",
        params![conversation_id],
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat::ChatMessage;
    use crate::db::{load_messages, record_sub_agent_started, save_message};

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        Db::open(path)
    }

    #[test]
    fn clear_conversation_wipes_only_the_targeted_conversation() {
        let db = temp_db();
        save_message(
            &db,
            "/proj-a",
            "/proj-a",
            &ChatMessage {
                role: "user".into(),
                content: "in project a".into(),
                tool_calls: None,
            },
        );
        save_message(
            &db,
            "/proj-b",
            "/proj-b",
            &ChatMessage {
                role: "user".into(),
                content: "in project b".into(),
                tool_calls: None,
            },
        );

        clear_conversation(&db, "/proj-a");

        assert_eq!(load_messages(&db, "/proj-a").len(), 0);
        assert_eq!(load_messages(&db, "/proj-b").len(), 1);
    }

    #[test]
    fn clear_conversation_lets_a_fresh_message_start_a_new_conversation_row() {
        let db = temp_db();
        save_message(
            &db,
            "/proj",
            "/proj",
            &ChatMessage {
                role: "user".into(),
                content: "before clear".into(),
                tool_calls: None,
            },
        );
        clear_conversation(&db, "/proj");
        save_message(
            &db,
            "/proj",
            "/proj",
            &ChatMessage {
                role: "user".into(),
                content: "after clear".into(),
                tool_calls: None,
            },
        );

        let loaded = load_messages(&db, "/proj");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].content, "after clear");
    }

    #[test]
    fn clear_conversation_also_wipes_its_own_sub_agents_but_not_unrelated_ones() {
        let db = temp_db();
        record_sub_agent_started(
            &db,
            "/proj::spawn_sub_agent::abc",
            "/proj",
            "count files",
            "count the files",
        );
        save_message(
            &db,
            "/proj::spawn_sub_agent::abc",
            "/proj",
            &ChatMessage {
                role: "user".into(),
                content: "sub-agent prompt".into(),
                tool_calls: None,
            },
        );
        record_sub_agent_started(
            &db,
            "/other::spawn_sub_agent::xyz",
            "/other",
            "unrelated task",
            "do something else",
        );

        clear_conversation(&db, "/proj");

        assert!(crate::db::list_sub_agents_for_parent(&db, "/proj", 50).is_empty());
        assert!(load_messages(&db, "/proj::spawn_sub_agent::abc").is_empty());
        assert_eq!(
            crate::db::list_sub_agents_for_parent(&db, "/other", 50).len(),
            1
        );
    }

    #[test]
    fn clear_conversation_drops_the_stored_acp_session_so_it_cannot_be_resumed() {
        use crate::db::{get_acp_agent_session_id, set_acp_agent_session_id};

        let db = temp_db();
        set_acp_agent_session_id(&db, "/proj", "claude-code", "agent-sess-1");
        set_acp_agent_session_id(&db, "/other", "claude-code", "agent-sess-2");

        clear_conversation(&db, "/proj");

        assert_eq!(get_acp_agent_session_id(&db, "/proj", "claude-code"), None);
        assert_eq!(
            get_acp_agent_session_id(&db, "/other", "claude-code"),
            Some("agent-sess-2".to_string())
        );
    }

    #[test]
    fn list_all_conversations_excludes_sub_agents_and_sorts_by_recency() {
        let db = temp_db();
        save_message(
            &db,
            "/proj-a",
            "/proj-a",
            &ChatMessage {
                role: "user".into(),
                content: "first".into(),
                tool_calls: None,
            },
        );
        save_message(
            &db,
            "/proj-b",
            "/proj-b",
            &ChatMessage {
                role: "user".into(),
                content: "second".into(),
                tool_calls: None,
            },
        );
        // Both saves above land in the same wall-clock second (`now()` is
        // second-resolution) — pin distinct `updated_at` values directly so
        // the recency-sort assertion below isn't racing the clock.
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "UPDATE conversations SET updated_at = 1 WHERE id = '/proj-a'",
                [],
            )
            .unwrap();
            conn.execute(
                "UPDATE conversations SET updated_at = 2 WHERE id = '/proj-b'",
                [],
            )
            .unwrap();
        }
        record_sub_agent_started(
            &db,
            "/proj-a::spawn_sub_agent::abc",
            "/proj-a",
            "count files",
            "count the files",
        );
        save_message(
            &db,
            "/proj-a::spawn_sub_agent::abc",
            "/proj-a",
            &ChatMessage {
                role: "user".into(),
                content: "sub-agent prompt".into(),
                tool_calls: None,
            },
        );

        let all = list_all_conversations(&db);

        assert_eq!(all.len(), 2);
        assert!(all.iter().all(|c| !c.id.contains("spawn_sub_agent")));
        assert_eq!(all[0].id, "/proj-b");
        assert_eq!(all[1].id, "/proj-a");
    }

    #[test]
    fn delete_conversation_removes_it_but_not_others() {
        let db = temp_db();
        save_message(
            &db,
            "/proj-a",
            "/proj-a",
            &ChatMessage {
                role: "user".into(),
                content: "in project a".into(),
                tool_calls: None,
            },
        );
        save_message(
            &db,
            "/proj-b",
            "/proj-b",
            &ChatMessage {
                role: "user".into(),
                content: "in project b".into(),
                tool_calls: None,
            },
        );

        delete_conversation(&db, "/proj-a");

        assert_eq!(load_messages(&db, "/proj-a").len(), 0);
        assert_eq!(load_messages(&db, "/proj-b").len(), 1);
        assert_eq!(
            list_all_conversations(&db)
                .iter()
                .map(|c| c.id.clone())
                .collect::<Vec<_>>(),
            vec!["/proj-b".to_string()]
        );
    }
}
