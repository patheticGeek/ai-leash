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
mod rate_limit;
mod sub_agents;

pub use acp_sessions::{
    delete_acp_agent_session_id, get_acp_agent_session_id, set_acp_agent_session_id, AgentSessionId,
};
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
        // Existing databases predate the "done" flag. Same existence check as
        // `title`/`duration_seconds`/`worktree_path` above.
        let has_done = conn
            .prepare("PRAGMA table_info(conversations)")
            .and_then(|mut stmt| {
                stmt.query_map([], |row| row.get::<_, String>(1))?
                    .collect::<rusqlite::Result<Vec<_>>>()
            })
            .map(|columns| columns.iter().any(|column| column == "done"))
            .expect("failed to inspect conversations schema");
        if !has_done {
            conn.execute(
                "ALTER TABLE conversations ADD COLUMN done INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .expect("failed to migrate conversation done flag");
        }
        // Some dev databases carry a `branch_name` column from an earlier
        // schema that nothing reads or writes anymore (a branch name is
        // deliberately never persisted — see `git.rs`'s module doc). Best
        // effort: a failed drop must not stop the app from starting.
        let has_branch_name = conn
            .prepare("PRAGMA table_info(conversations)")
            .and_then(|mut stmt| {
                stmt.query_map([], |row| row.get::<_, String>(1))?
                    .collect::<rusqlite::Result<Vec<_>>>()
            })
            .map(|columns| columns.iter().any(|column| column == "branch_name"))
            .expect("failed to inspect conversations schema");
        if has_branch_name {
            let _ = conn.execute("ALTER TABLE conversations DROP COLUMN branch_name", []);
        }
        // Existing databases predate recording a sub-agent's model/effort
        // override. Same existence check as `title`/`duration_seconds` above.
        let has_model = conn
            .prepare("PRAGMA table_info(sub_agents)")
            .and_then(|mut stmt| {
                stmt.query_map([], |row| row.get::<_, String>(1))?
                    .collect::<rusqlite::Result<Vec<_>>>()
            })
            .map(|columns| columns.iter().any(|column| column == "model"))
            .expect("failed to inspect sub_agents schema");
        if !has_model {
            conn.execute("ALTER TABLE sub_agents ADD COLUMN model TEXT", [])
                .expect("failed to migrate sub_agent model");
            conn.execute("ALTER TABLE sub_agents ADD COLUMN effort TEXT", [])
                .expect("failed to migrate sub_agent effort");
        }
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
