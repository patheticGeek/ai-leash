//! `conversations` table access: the per-row upsert shared by every message
//! write (see `messages::save_message`/`start_streaming_message`), and
//! whole-conversation deletion, which cascades into `messages` and
//! `sub_agents` too — deleting a conversation isn't just a `conversations`
//! table op, so it lives here rather than being split across files.

use super::Db;
use rusqlite::{params, Connection};

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
}
