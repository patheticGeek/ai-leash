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
            CREATE TABLE IF NOT EXISTS sub_agents (
                id TEXT PRIMARY KEY,
                parent_session_id TEXT NOT NULL,
                description TEXT NOT NULL,
                prompt TEXT NOT NULL,
                status TEXT NOT NULL,
                result TEXT,
                started_at INTEGER NOT NULL,
                finished_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_sub_agents_parent ON sub_agents(parent_session_id, started_at);
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
        let _ = conn.execute("DELETE FROM conversations WHERE id = ?1", params![sub_agent_id]);
    }
    let _ = conn.execute(
        "DELETE FROM sub_agents WHERE parent_session_id = ?1",
        params![conversation_id],
    );

    let _ = conn.execute(
        "DELETE FROM messages WHERE conversation_id = ?1",
        params![conversation_id],
    );
    let _ = conn.execute("DELETE FROM conversations WHERE id = ?1", params![conversation_id]);
}

/// Metadata for one `spawn_sub_agent`-spawned sub-agent, as shown in the Sub
/// Agents sidebar — the full transcript itself lives in `messages`/
/// `conversations` like any other session, keyed by `id` (the sub-agent's
/// `sub_session_id`) as its `conversation_id`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentSummary {
    pub id: String,
    pub parent_session_id: String,
    pub description: String,
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
}

pub struct SubAgentMeta {
    pub prompt: String,
    pub status: String,
}

pub fn record_sub_agent_started(
    db: &Db,
    id: &str,
    parent_session_id: &str,
    description: &str,
    prompt: &str,
) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "INSERT INTO sub_agents (id, parent_session_id, description, prompt, status, started_at) VALUES (?1, ?2, ?3, ?4, 'running', ?5)",
        params![id, parent_session_id, description, prompt, now()],
    );
}

pub fn record_sub_agent_finished(db: &Db, id: &str, status: &str, result: &str) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "UPDATE sub_agents SET status = ?1, result = ?2, finished_at = ?3 WHERE id = ?4",
        params![status, result, now(), id],
    );
}

fn query_sub_agents(conn: &Connection, where_clause: &str, params: &[&dyn rusqlite::ToSql]) -> Vec<SubAgentSummary> {
    let sql = format!(
        "SELECT id, parent_session_id, description, status, started_at, finished_at FROM sub_agents {where_clause} ORDER BY started_at DESC"
    );
    let Ok(mut stmt) = conn.prepare(&sql) else {
        return vec![];
    };
    let rows = stmt.query_map(params, |row| {
        Ok(SubAgentSummary {
            id: row.get(0)?,
            parent_session_id: row.get(1)?,
            description: row.get(2)?,
            status: row.get(3)?,
            started_at: row.get(4)?,
            finished_at: row.get(5)?,
        })
    });
    match rows {
        Ok(iter) => iter.filter_map(Result::ok).collect(),
        Err(_) => vec![],
    }
}

pub fn list_sub_agents_for_parent(db: &Db, parent_session_id: &str, limit: usize) -> Vec<SubAgentSummary> {
    let conn = db.0.lock().unwrap();
    let mut items = query_sub_agents(&conn, "WHERE parent_session_id = ?1", params![parent_session_id]);
    items.truncate(limit);
    items
}

/// Cross-project — the Sub Agents sidebar's own scope (it's a global
/// history, not scoped to the currently open project). Capped at a generous
/// but bounded count so a very long-lived app doesn't load an unbounded list.
pub fn list_all_sub_agents(db: &Db) -> Vec<SubAgentSummary> {
    let conn = db.0.lock().unwrap();
    let mut items = query_sub_agents(&conn, "", params![]);
    items.truncate(500);
    items
}

pub fn get_sub_agent(db: &Db, id: &str) -> Option<SubAgentMeta> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT prompt, status FROM sub_agents WHERE id = ?1",
        params![id],
        |row| {
            Ok(SubAgentMeta {
                prompt: row.get(0)?,
                status: row.get(1)?,
            })
        },
    )
    .ok()
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
    fn records_and_finishes_sub_agent_lifecycle() {
        let db = temp_db();
        record_sub_agent_started(&db, "/proj::spawn_sub_agent::abc", "/proj", "count files", "count the files");

        let running = list_sub_agents_for_parent(&db, "/proj", 50);
        assert_eq!(running.len(), 1);
        assert_eq!(running[0].status, "running");
        assert!(running[0].finished_at.is_none());

        record_sub_agent_finished(&db, "/proj::spawn_sub_agent::abc", "done", "there are 3 files");

        let meta = get_sub_agent(&db, "/proj::spawn_sub_agent::abc").expect("sub-agent exists");
        assert_eq!(meta.status, "done");
        assert_eq!(meta.prompt, "count the files");

        let finished = list_sub_agents_for_parent(&db, "/proj", 50);
        assert_eq!(finished[0].status, "done");
        assert!(finished[0].finished_at.is_some());
    }

    #[test]
    fn list_all_sub_agents_spans_parents() {
        let db = temp_db();
        record_sub_agent_started(&db, "/proj-a::spawn_sub_agent::1", "/proj-a", "task a", "do a");
        record_sub_agent_started(&db, "/proj-b::spawn_sub_agent::2", "/proj-b", "task b", "do b");

        assert_eq!(list_all_sub_agents(&db).len(), 2);
        assert_eq!(list_sub_agents_for_parent(&db, "/proj-a", 50).len(), 1);
        assert_eq!(list_sub_agents_for_parent(&db, "/proj-b", 50).len(), 1);
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

    #[test]
    fn clear_conversation_wipes_only_the_targeted_conversation() {
        let db = temp_db();
        save_message(
            &db,
            "/proj-a",
            "/proj-a",
            &ChatMessage { role: "user".into(), content: "in project a".into(), tool_calls: None },
        );
        save_message(
            &db,
            "/proj-b",
            "/proj-b",
            &ChatMessage { role: "user".into(), content: "in project b".into(), tool_calls: None },
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
            &ChatMessage { role: "user".into(), content: "before clear".into(), tool_calls: None },
        );
        clear_conversation(&db, "/proj");
        save_message(
            &db,
            "/proj",
            "/proj",
            &ChatMessage { role: "user".into(), content: "after clear".into(), tool_calls: None },
        );

        let loaded = load_messages(&db, "/proj");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].content, "after clear");
    }

    #[test]
    fn clear_conversation_also_wipes_its_own_sub_agents_but_not_unrelated_ones() {
        let db = temp_db();
        record_sub_agent_started(&db, "/proj::spawn_sub_agent::abc", "/proj", "count files", "count the files");
        save_message(
            &db,
            "/proj::spawn_sub_agent::abc",
            "/proj",
            &ChatMessage { role: "user".into(), content: "sub-agent prompt".into(), tool_calls: None },
        );
        record_sub_agent_started(
            &db,
            "/other::spawn_sub_agent::xyz",
            "/other",
            "unrelated task",
            "do something else",
        );

        clear_conversation(&db, "/proj");

        assert!(list_sub_agents_for_parent(&db, "/proj", 50).is_empty());
        assert!(load_messages(&db, "/proj::spawn_sub_agent::abc").is_empty());
        assert_eq!(list_sub_agents_for_parent(&db, "/other", 50).len(), 1);
    }
}
