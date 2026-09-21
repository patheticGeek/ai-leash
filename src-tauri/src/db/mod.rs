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
mod action_last_run;
mod conversations;
mod messages;
mod migrations;
mod projects;
mod rate_limit;
mod sub_agents;

pub use acp_sessions::{
    delete_acp_agent_session_id, get_acp_agent_session_id, set_acp_agent_session_id, AgentSessionId,
};
pub use action_last_run::{clear_last_run_action, get_last_run_action, set_last_run_action};
pub use conversations::{
    clear_conversation, conversation_exists, delete_conversation, get_conversation_title,
    list_all_conversations, set_conversation_done, set_conversation_title,
    set_conversation_worktree, ConversationSummary,
};
pub use messages::{
    finish_streaming_message, load_messages, save_message, set_message_duration,
    start_streaming_message, update_streaming_message, update_tool_call_args, PersistedMessage,
};
pub use projects::{ensure_project, list_projects, touch_project, ProjectSummary};
pub use rate_limit::{
    armed_rate_limit_conversations, get_rate_limit_choice, last_message, set_rate_limit_choice,
};
pub use sub_agents::{
    delete_sub_agent, get_sub_agent_for_parent, list_sub_agents_for_parent,
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
                done INTEGER NOT NULL DEFAULT 0,
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
            CREATE TABLE IF NOT EXISTS rate_limit_resumes (
                conversation_id TEXT PRIMARY KEY,
                message_id INTEGER NOT NULL,
                armed INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS action_last_run (
                checkout_path TEXT PRIMARY KEY,
                action_id TEXT NOT NULL,
                ran_at INTEGER NOT NULL
            );
            ",
        )
        .expect("failed to initialize history database schema");
        migrations::run(&conn);
        // Not a migration: reconciles rows the app itself may have written
        // without a project since (a conversation created before its project
        // row existed), so it runs on every open.
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
        Db(Mutex::new(conn))
    }
}

impl Default for Db {
    fn default() -> Self {
        Self::open(db_path())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conversation_columns(db: &Db) -> Vec<String> {
        let conn = db.0.lock().unwrap();
        let mut stmt = conn.prepare("PRAGMA table_info(conversations)").unwrap();
        stmt.query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap()
    }

    #[test]
    fn open_drops_the_legacy_branch_name_column_and_keeps_the_data() {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        let db = Db::open(path.clone());
        db.0.lock()
            .unwrap()
            .execute_batch(
                "ALTER TABLE conversations ADD COLUMN branch_name TEXT;
                 PRAGMA user_version = 0;
                 INSERT INTO conversations (id, project_root, created_at, updated_at, branch_name)
                 VALUES ('c1', '/proj', 1, 2, 'main');",
            )
            .unwrap();
        assert!(conversation_columns(&db).contains(&"branch_name".to_string()));
        drop(db);

        let reopened = Db::open(path);
        assert!(!conversation_columns(&reopened).contains(&"branch_name".to_string()));
        let count: i64 = reopened
            .0
            .lock()
            .unwrap()
            .query_row(
                "SELECT count(*) FROM conversations WHERE id = 'c1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }
}
