//! `messages` table access — save/stream/load a conversation's individual
//! messages. Every write here also upserts the owning `conversations` row
//! via `conversations::upsert_conversation`, since a message can't exist
//! without a conversation row to point at.

use super::conversations::upsert_conversation;
use super::{now, Db};
use crate::chat::ChatMessage;
use crate::tools::ToolCall;
use rusqlite::params;
use serde::Serialize;

/// A message as read back from disk, with its real send time attached (as
/// opposed to `ChatMessage`, which is only ever used for the live in-memory
/// history sent to Ollama and has no timestamp of its own).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PersistedMessage {
    pub role: String,
    pub content: String,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub created_at: i64,
}

/// Appends one message to `conversation_id`'s history on disk. No-op for
/// `system` messages, which are rebuilt from AGENTS.md/memory every turn
/// rather than being real conversation content (see `refresh_system_prompt`,
/// which never routes through here in the first place — this check just
/// guards direct callers).
pub fn save_message(db: &Db, conversation_id: &str, project_root: &str, message: &ChatMessage) {
    if message.role == "system" {
        return;
    }
    let conn = db.0.lock().unwrap();
    let ts = now();
    upsert_conversation(&conn, conversation_id, project_root, ts);
    let tool_calls_json = message
        .tool_calls
        .as_ref()
        .map(|c| serde_json::to_string(c).unwrap_or_default());
    let _ = conn.execute(
        "INSERT INTO messages (conversation_id, role, content, tool_calls, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![conversation_id, message.role, message.content, tool_calls_json, ts],
    );
}

/// Inserts a new message starting from empty content and returns its row id,
/// so a streaming turn can be persisted incrementally via
/// `update_streaming_message` as chunks arrive instead of only once the whole
/// turn finishes — an app crash mid-stream then loses at most whatever
/// arrived since the last flush, not the entire reply. Mirrors
/// `save_message`'s conversation upsert so the row shows up under the same
/// `conversations` bookkeeping.
pub fn start_streaming_message(
    db: &Db,
    conversation_id: &str,
    project_root: &str,
    role: &str,
) -> i64 {
    let conn = db.0.lock().unwrap();
    let ts = now();
    upsert_conversation(&conn, conversation_id, project_root, ts);
    let _ = conn.execute(
        "INSERT INTO messages (conversation_id, role, content, tool_calls, created_at) VALUES (?1, ?2, '', NULL, ?3)",
        params![conversation_id, role, ts],
    );
    conn.last_insert_rowid()
}

/// Overwrites a streaming message's content in place — see
/// `start_streaming_message`. Called on every chunk, so this is deliberately
/// the cheapest possible write (no conversation-row upsert, no tool_calls
/// touched).
pub fn update_streaming_message(db: &Db, message_id: i64, content: &str) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "UPDATE messages SET content = ?1 WHERE id = ?2",
        params![content, message_id],
    );
}

/// Final write for a streamed message: content was already kept current by
/// `update_streaming_message` throughout, so this mainly attaches
/// `tool_calls` (never known until the turn is fully parsed) and makes sure
/// the last chunk landed even if the model's own "done" signal outraced it.
pub fn finish_streaming_message(
    db: &Db,
    message_id: i64,
    content: &str,
    tool_calls: &Option<Vec<ToolCall>>,
) {
    let conn = db.0.lock().unwrap();
    let tool_calls_json = tool_calls
        .as_ref()
        .map(|c| serde_json::to_string(c).unwrap_or_default());
    let _ = conn.execute(
        "UPDATE messages SET content = ?1, tool_calls = ?2 WHERE id = ?3",
        params![content, tool_calls_json, message_id],
    );
}

/// Loads a conversation's full history, oldest first, timestamps attached —
/// used both to re-seed `chat_sessions` (so the conversation can continue)
/// and, as-is, for the frontend to render.
pub fn load_messages(db: &Db, conversation_id: &str) -> Vec<PersistedMessage> {
    let conn = db.0.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT role, content, tool_calls, created_at FROM messages WHERE conversation_id = ?1 ORDER BY id ASC",
    ) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let rows = stmt.query_map(params![conversation_id], |row| {
        let role: String = row.get(0)?;
        let content: String = row.get(1)?;
        let tool_calls_json: Option<String> = row.get(2)?;
        let created_at: i64 = row.get(3)?;
        let tool_calls =
            tool_calls_json.and_then(|s| serde_json::from_str::<Vec<ToolCall>>(&s).ok());
        Ok(PersistedMessage {
            role,
            content,
            tool_calls,
            created_at,
        })
    });
    match rows {
        Ok(iter) => iter.filter_map(Result::ok).collect(),
        Err(_) => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::ToolCallFunction;

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        Db::open(path)
    }

    #[test]
    fn round_trips_plain_messages_in_order() {
        let db = temp_db();
        save_message(
            &db,
            "/proj",
            "/proj",
            &ChatMessage {
                role: "user".into(),
                content: "hello".into(),
                tool_calls: None,
            },
        );
        save_message(
            &db,
            "/proj",
            "/proj",
            &ChatMessage {
                role: "assistant".into(),
                content: "hi there".into(),
                tool_calls: None,
            },
        );

        let loaded = load_messages(&db, "/proj");
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].role, "user");
        assert_eq!(loaded[0].content, "hello");
        assert_eq!(loaded[1].role, "assistant");
        assert_eq!(loaded[1].content, "hi there");
    }

    #[test]
    fn round_trips_tool_calls() {
        let db = temp_db();
        save_message(
            &db,
            "/proj",
            "/proj",
            &ChatMessage {
                role: "assistant".into(),
                content: String::new(),
                tool_calls: Some(vec![ToolCall {
                    id: Some("call-1".into()),
                    function: ToolCallFunction {
                        name: "read_file".into(),
                        arguments: serde_json::json!({ "path": "a.rs" }),
                    },
                }]),
            },
        );

        let loaded = load_messages(&db, "/proj");
        let calls = loaded[0]
            .tool_calls
            .as_ref()
            .expect("tool_calls survived round trip");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id.as_deref(), Some("call-1"));
        assert_eq!(calls[0].function.name, "read_file");
    }

    #[test]
    fn skips_only_system_messages() {
        let db = temp_db();
        save_message(
            &db,
            "/proj",
            "/proj",
            &ChatMessage {
                role: "system".into(),
                content: "AGENTS.md content".into(),
                tool_calls: None,
            },
        );

        assert!(load_messages(&db, "/proj").is_empty());
    }

    #[test]
    fn round_trips_sub_agent_session_messages() {
        let db = temp_db();
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

        let loaded = load_messages(&db, "/proj::spawn_sub_agent::abc");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].content, "sub-agent prompt");
    }

    #[test]
    fn separate_conversations_stay_separate() {
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

        assert_eq!(load_messages(&db, "/proj-a").len(), 1);
        assert_eq!(load_messages(&db, "/proj-b").len(), 1);
        assert_eq!(load_messages(&db, "/proj-a")[0].content, "in project a");
    }
}
