//! SQLite-backed persistence, split by table: `conversations.rs`,
//! `messages.rs`, `sub_agents.rs` each own the SQL for their own table
//! (`conversations.rs` additionally owns titles and whole-conversation deletes, which
//! cascade into the other two tables). This module holds only what's
//! genuinely shared: the `Db` handle itself, connection/schema setup, and
//! the `now()` timestamp helper the other two files call into.

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

mod acp_sessions;
mod conversations;
mod messages;
mod projects;
mod sub_agents;

pub use acp_sessions::{
    delete_acp_agent_session_id, get_acp_agent_session_id, set_acp_agent_session_id,
};
pub use conversations::{
    clear_conversation, conversation_exists, delete_conversation, get_conversation_title,
    list_all_conversations, set_conversation_title, set_conversation_worktree, ConversationSummary,
};
pub use messages::{
    finish_streaming_message, load_messages, save_message, set_message_duration,
    start_streaming_message, update_streaming_message, update_tool_call_args, PersistedMessage,
};
pub use projects::{ensure_project, list_projects, touch_project, ProjectSummary};
pub use sub_agents::{
    delete_sub_agent, get_sub_agent, list_all_sub_agents, list_sub_agents_for_parent,
    record_sub_agent_finished, record_sub_agent_started, SubAgentSummary,
};

pub struct Db(Mutex<Connection>);

fn db_path() -> PathBuf {
    crate::paths::versioned_file("history", "db")
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl Db {
    pub(crate) fn open(path: PathBuf) -> Self {
        let conn = Connection::open(path).expect("failed to open history database");
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let _ = conn.pragma_update(None, "foreign_keys", "ON");
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                root_path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                last_opened_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_projects_last_opened
                ON projects(last_opened_at, updated_at);
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                project_root TEXT NOT NULL,
                project_id TEXT,
                title TEXT,
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
            CREATE TABLE IF NOT EXISTS acp_agent_sessions (
                conversation_id TEXT NOT NULL,
                launch_command TEXT NOT NULL,
                agent_session_id TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (conversation_id, launch_command)
            );
            ",
        )
        .expect("failed to initialize history database schema");
        // Existing databases keep their old `project_root` column for now;
        // this lightweight backfill is intentionally not a migration manager.
        let has_project_id = conn
            .prepare("PRAGMA table_info(conversations)")
            .and_then(|mut stmt| {
                stmt.query_map([], |row| row.get::<_, String>(1))?
                    .collect::<rusqlite::Result<Vec<_>>>()
            })
            .map(|columns| columns.iter().any(|column| column == "project_id"))
            .expect("failed to inspect conversation project ownership");
        if !has_project_id {
            conn.execute("ALTER TABLE conversations ADD COLUMN project_id TEXT", [])
                .expect("failed to add conversation project ownership");
        }
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_conversations_project
             ON conversations(project_id, updated_at)",
            [],
        )
        .expect("failed to index conversation project ownership");
        conn.execute(
            "INSERT OR IGNORE INTO projects
             (id, root_path, name, created_at, updated_at, last_opened_at)
             SELECT lower(hex(randomblob(16))), project_root,
                    coalesce(nullif(rtrim(project_root, '/'), ''), project_root),
                    min(created_at), max(updated_at), max(updated_at)
             FROM conversations GROUP BY project_root",
            [],
        )
        .expect("failed to backfill projects");
        conn.execute(
            "UPDATE conversations
             SET project_id = (SELECT id FROM projects WHERE projects.root_path = conversations.project_root)
             WHERE project_id IS NULL",
            [],
        )
        .expect("failed to backfill conversation project ownership");
        // Existing databases predate conversation titles. Check first so a
        // real migration failure is not mistaken for an already-applied one.
        let has_title = conn
            .prepare("PRAGMA table_info(conversations)")
            .and_then(|mut stmt| {
                stmt.query_map([], |row| row.get::<_, String>(1))?
                    .collect::<rusqlite::Result<Vec<_>>>()
            })
            .map(|columns| columns.iter().any(|column| column == "title"))
            .expect("failed to inspect conversations schema");
        if !has_title {
            conn.execute("ALTER TABLE conversations ADD COLUMN title TEXT", [])
                .expect("failed to migrate conversation titles");
        }
        // Existing databases predate turn durations. Same existence check as
        // `title` above, for the same reason.
        let has_duration = conn
            .prepare("PRAGMA table_info(messages)")
            .and_then(|mut stmt| {
                stmt.query_map([], |row| row.get::<_, String>(1))?
                    .collect::<rusqlite::Result<Vec<_>>>()
            })
            .map(|columns| columns.iter().any(|column| column == "duration_seconds"))
            .expect("failed to inspect messages schema");
        if !has_duration {
            conn.execute(
                "ALTER TABLE messages ADD COLUMN duration_seconds INTEGER",
                [],
            )
            .expect("failed to migrate message durations");
        }
        // Existing databases predate per-conversation worktrees. Same
        // existence check as `title`/`duration_seconds` above.
        let has_worktree = conn
            .prepare("PRAGMA table_info(conversations)")
            .and_then(|mut stmt| {
                stmt.query_map([], |row| row.get::<_, String>(1))?
                    .collect::<rusqlite::Result<Vec<_>>>()
            })
            .map(|columns| columns.iter().any(|column| column == "worktree_path"))
            .expect("failed to inspect conversations schema");
        if !has_worktree {
            conn.execute(
                "ALTER TABLE conversations ADD COLUMN worktree_path TEXT",
                [],
            )
            .expect("failed to migrate conversation worktree path");
        }
        Db(Mutex::new(conn))
    }
}

impl Default for Db {
    fn default() -> Self {
        Self::open(db_path())
    }
}
