use crate::chat::ChatMessage;
use crate::tools::ToolCall;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;

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

pub struct Db(Mutex<Connection>);

fn db_path() -> PathBuf {
    let dir = dirs::config_dir()
        .map(|d| d.join("ai-leash"))
        .unwrap_or_else(std::env::temp_dir);
    let _ = std::fs::create_dir_all(&dir);
    dir.join("history.db")
}

/// Sub-agent sessions are transient scratch work — discarded from
/// `chat_sessions` the moment they finish (see `run_sub_agent`) — and never
/// persisted; only a top-level, project-keyed conversation is. Distinguished
/// by the `::spawn_sub_agent::` marker `execute_tool` builds every
/// `sub_session_id` with.
pub fn is_persistable(session_id: &str) -> bool {
    !session_id.contains("::spawn_sub_agent::")
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl Db {
    fn open(path: PathBuf) -> Self {
        let conn = Connection::open(path).expect("failed to open history database");
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                project_root TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tool_calls TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
            ",
        )
        .expect("failed to initialize history database schema");
        Db(Mutex::new(conn))
    }
}

impl Default for Db {
    fn default() -> Self {
        Self::open(db_path())
    }
}

/// Appends one message to `conversation_id`'s history on disk. No-op for
/// non-persistable (sub-agent) session ids and for `system` messages, which
/// are rebuilt from AGENTS.md/memory every turn rather than being real
/// conversation content (see `refresh_system_prompt`, which never routes
/// through here in the first place — this check just guards direct callers).
pub fn save_message(db: &Db, conversation_id: &str, project_root: &str, message: &ChatMessage) {
    if message.role == "system" || !is_persistable(conversation_id) {
        return;
    }
    let conn = db.0.lock().unwrap();
    let ts = now();
    let _ = conn.execute(
        "INSERT INTO conversations (id, project_root, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(id) DO UPDATE SET updated_at = ?3",
        params![conversation_id, project_root, ts],
    );
    let tool_calls_json = message
        .tool_calls
        .as_ref()
        .map(|c| serde_json::to_string(c).unwrap_or_default());
    let _ = conn.execute(
        "INSERT INTO messages (conversation_id, role, content, tool_calls, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![conversation_id, message.role, message.content, tool_calls_json, ts],
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
        let tool_calls = tool_calls_json.and_then(|s| serde_json::from_str::<Vec<ToolCall>>(&s).ok());
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
        let calls = loaded[0].tool_calls.as_ref().expect("tool_calls survived round trip");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id.as_deref(), Some("call-1"));
        assert_eq!(calls[0].function.name, "read_file");
    }

    #[test]
    fn skips_system_messages_and_sub_agent_sessions() {
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

        assert!(load_messages(&db, "/proj").is_empty());
        assert!(load_messages(&db, "/proj::spawn_sub_agent::abc").is_empty());
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
