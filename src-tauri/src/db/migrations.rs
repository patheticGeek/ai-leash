//! Schema migrations, tracked with SQLite's `PRAGMA user_version`.
//!
//! `Db::open` creates every table with `CREATE TABLE IF NOT EXISTS` (the
//! baseline schema) and then calls `run`, which applies every entry of
//! `MIGRATIONS` past the database's stored version, each in its own
//! transaction together with the version bump.
//!
//! The list is append-only: never edit or reorder a shipped entry, add a new
//! one at the end. `v1_legacy_columns` is the exception in style only — it
//! folds in every column probe that predates the runner, so it guards each
//! step with `has_column` because databases at version 0 could be at any
//! point in that history. Later migrations know exactly what they start from
//! and can use plain `ALTER TABLE`.

use rusqlite::Connection;

type Migration = fn(&Connection);

const MIGRATIONS: &[Migration] = &[v1_legacy_columns, v2_conversation_graph];

pub(super) fn run(conn: &Connection) {
    let current: usize = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("failed to read schema version");
    for (index, migration) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn
            .unchecked_transaction()
            .expect("failed to start schema migration");
        migration(&tx);
        tx.pragma_update(None, "user_version", (index + 1) as i64)
            .expect("failed to record schema version");
        tx.commit().expect("failed to commit schema migration");
    }
}

fn has_column(conn: &Connection, table: &str, column: &str) -> bool {
    conn.prepare(&format!("PRAGMA table_info({table})"))
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))?
                .collect::<rusqlite::Result<Vec<_>>>()
        })
        .map(|columns| columns.iter().any(|c| c == column))
        .unwrap_or_else(|e| panic!("failed to inspect {table} schema: {e}"))
}

fn add_column_if_missing(conn: &Connection, table: &str, column: &str, definition: &str) {
    if !has_column(conn, table, column) {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )
        .unwrap_or_else(|e| panic!("failed to add {table}.{column}: {e}"));
    }
}

/// Everything that used to be probed for on every open, before the runner
/// existed: project ownership, titles, turn durations, per-conversation
/// worktrees, the done flag, sub-agent model/effort overrides, and dropping
/// the dead `branch_name` column.
fn v1_legacy_columns(conn: &Connection) {
    add_column_if_missing(conn, "conversations", "project_id", "TEXT");
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_project
         ON conversations(project_id, updated_at)",
        [],
    )
    .expect("failed to index conversation project ownership");
    add_column_if_missing(conn, "conversations", "title", "TEXT");
    add_column_if_missing(conn, "messages", "duration_seconds", "INTEGER");
    add_column_if_missing(conn, "conversations", "worktree_path", "TEXT");
    add_column_if_missing(conn, "conversations", "done", "INTEGER NOT NULL DEFAULT 0");
    add_column_if_missing(conn, "sub_agents", "model", "TEXT");
    add_column_if_missing(conn, "sub_agents", "effort", "TEXT");
    // Some dev databases carry a `branch_name` column from an earlier schema
    // that nothing reads or writes anymore (a branch name is deliberately
    // never persisted — see `git.rs`'s module doc). Best effort: a failed
    // drop must not stop the app from starting.
    if has_column(conn, "conversations", "branch_name") {
        let _ = conn.execute("ALTER TABLE conversations DROP COLUMN branch_name", []);
    }
}

/// Groundwork for owned/persistent agents and branching (see PLAN.md,
/// "Schema"): every agent context is a `conversations` row, related to others
/// by columns instead of by side tables.
///
/// - `owner_conversation_id` — who owns/supervises it (NULL = top level);
///   drives cascade delete. `parent_conversation_id` and
///   `branch_point_message_id` are branch provenance, a different tree, with
///   no foreign keys so deleting a parent never touches its forks.
/// - `hidden` keeps a row out of the sidebar independent of ownership;
///   `role` and `name` label it (`name` unique per owner); `lifecycle` and
///   `persistent` describe a long-lived agent.
/// - `backend`/`model`/`effort`/`permission_mode` are per-conversation
///   settings; NULL means "use the default".
/// - `messages.from_conversation_id` tags a message delivered by another
///   agent.
///
/// Existing sub-agents become owned, hidden conversation rows. The
/// `sub_agents` table stays for now as their prompt/result record.
fn v2_conversation_graph(conn: &Connection) {
    conn.execute_batch(
        "
        ALTER TABLE conversations ADD COLUMN owner_conversation_id TEXT;
        ALTER TABLE conversations ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE conversations ADD COLUMN role TEXT;
        ALTER TABLE conversations ADD COLUMN name TEXT;
        ALTER TABLE conversations ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'idle';
        ALTER TABLE conversations ADD COLUMN persistent INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE conversations ADD COLUMN parent_conversation_id TEXT;
        ALTER TABLE conversations ADD COLUMN branch_point_message_id INTEGER;
        ALTER TABLE conversations ADD COLUMN branch_label TEXT;
        ALTER TABLE conversations ADD COLUMN backend TEXT;
        ALTER TABLE conversations ADD COLUMN model TEXT;
        ALTER TABLE conversations ADD COLUMN effort TEXT;
        ALTER TABLE conversations ADD COLUMN permission_mode TEXT;
        ALTER TABLE messages ADD COLUMN from_conversation_id TEXT;
        CREATE INDEX idx_conversations_owner ON conversations(owner_conversation_id);
        CREATE UNIQUE INDEX idx_conversations_owner_name
            ON conversations(owner_conversation_id, name)
            WHERE owner_conversation_id IS NOT NULL AND name IS NOT NULL;

        INSERT OR IGNORE INTO conversations
            (id, project_root, project_id, created_at, updated_at)
            SELECT s.id, coalesce(p.project_root, ''), p.project_id,
                   s.started_at, coalesce(s.finished_at, s.started_at)
            FROM sub_agents s
            LEFT JOIN conversations p ON p.id = s.parent_session_id;
        UPDATE conversations
            SET owner_conversation_id = (
                    SELECT parent_session_id FROM sub_agents WHERE sub_agents.id = conversations.id),
                hidden = 1,
                role = 'sub-agent',
                lifecycle = (
                    SELECT CASE status
                               WHEN 'running' THEN 'running'
                               WHEN 'error' THEN 'failed'
                               ELSE 'stopped'
                           END
                    FROM sub_agents WHERE sub_agents.id = conversations.id)
            WHERE id IN (SELECT id FROM sub_agents);

        -- A stored agent session may back only one conversation, or two
        -- conversations could prompt (and corrupt) the same agent session.
        -- Keep the most recently written row of any duplicate pair first.
        DELETE FROM acp_agent_sessions
            WHERE EXISTS (
                SELECT 1 FROM acp_agent_sessions newer
                WHERE newer.agent_session_id = acp_agent_sessions.agent_session_id
                  AND newer.launch_command = acp_agent_sessions.launch_command
                  AND (newer.updated_at > acp_agent_sessions.updated_at
                       OR (newer.updated_at = acp_agent_sessions.updated_at
                           AND newer.rowid > acp_agent_sessions.rowid)));
        CREATE UNIQUE INDEX idx_acp_agent_sessions_agent_session
            ON acp_agent_sessions(agent_session_id, launch_command);
        ",
    )
    .expect("failed to add the conversation graph columns");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user_version(conn: &Connection) -> usize {
        conn.pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn upgrades_a_pre_runner_database_and_records_the_version() {
        let conn = Connection::open_in_memory().unwrap();
        // The oldest shape v1 has to cope with: no project_id/title/done/
        // worktree_path, no duration_seconds, no sub-agent model/effort, and
        // the legacy branch_name column.
        conn.execute_batch(
            "CREATE TABLE conversations (
                 id TEXT PRIMARY KEY, project_root TEXT NOT NULL,
                 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
                 branch_name TEXT);
             CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT,
                 conversation_id TEXT NOT NULL, role TEXT NOT NULL,
                 content TEXT NOT NULL, tool_calls TEXT, created_at INTEGER NOT NULL);
             CREATE TABLE sub_agents (id TEXT PRIMARY KEY, parent_session_id TEXT NOT NULL,
                 description TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL,
                 result TEXT, started_at INTEGER NOT NULL, finished_at INTEGER);
             CREATE TABLE acp_agent_sessions (conversation_id TEXT NOT NULL,
                 launch_command TEXT NOT NULL, agent_session_id TEXT NOT NULL,
                 updated_at INTEGER NOT NULL, PRIMARY KEY (conversation_id, launch_command));
             INSERT INTO conversations (id, project_root, created_at, updated_at, branch_name)
                 VALUES ('c1', '/proj', 1, 2, 'main');",
        )
        .unwrap();
        assert_eq!(user_version(&conn), 0);

        run(&conn);

        assert_eq!(user_version(&conn), MIGRATIONS.len());
        for (table, column) in [
            ("conversations", "project_id"),
            ("conversations", "title"),
            ("conversations", "worktree_path"),
            ("conversations", "done"),
            ("messages", "duration_seconds"),
            ("sub_agents", "model"),
            ("sub_agents", "effort"),
        ] {
            assert!(has_column(&conn, table, column), "{table}.{column}");
        }
        assert!(!has_column(&conn, "conversations", "branch_name"));
        let kept: i64 = conn
            .query_row("SELECT count(*) FROM conversations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, 1);
    }

    #[test]
    fn running_twice_is_a_no_op() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE conversations (id TEXT PRIMARY KEY, project_root TEXT NOT NULL,
                 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT,
                 conversation_id TEXT NOT NULL, role TEXT NOT NULL,
                 content TEXT NOT NULL, tool_calls TEXT, created_at INTEGER NOT NULL);
             CREATE TABLE sub_agents (id TEXT PRIMARY KEY, parent_session_id TEXT NOT NULL,
                 description TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL,
                 result TEXT, started_at INTEGER NOT NULL, finished_at INTEGER);
             CREATE TABLE acp_agent_sessions (conversation_id TEXT NOT NULL,
                 launch_command TEXT NOT NULL, agent_session_id TEXT NOT NULL,
                 updated_at INTEGER NOT NULL, PRIMARY KEY (conversation_id, launch_command));",
        )
        .unwrap();
        run(&conn);
        run(&conn);
        assert_eq!(user_version(&conn), MIGRATIONS.len());
    }
    #[test]
    fn v2_turns_existing_sub_agents_into_owned_hidden_conversations() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE conversations (id TEXT PRIMARY KEY, project_root TEXT NOT NULL,
                 project_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT,
                 conversation_id TEXT NOT NULL, role TEXT NOT NULL,
                 content TEXT NOT NULL, tool_calls TEXT, created_at INTEGER NOT NULL);
             CREATE TABLE sub_agents (id TEXT PRIMARY KEY, parent_session_id TEXT NOT NULL,
                 description TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL,
                 result TEXT, started_at INTEGER NOT NULL, finished_at INTEGER);
             CREATE TABLE acp_agent_sessions (conversation_id TEXT NOT NULL,
                 launch_command TEXT NOT NULL, agent_session_id TEXT NOT NULL,
                 updated_at INTEGER NOT NULL, PRIMARY KEY (conversation_id, launch_command));
             INSERT INTO conversations (id, project_root, project_id, created_at, updated_at)
                 VALUES ('parent', '/proj', 'p1', 1, 2), ('sub-done', '/proj', 'p1', 3, 4);
             INSERT INTO sub_agents VALUES
                 ('sub-done', 'parent', 'd', 'p', 'done', 'r', 3, 4),
                 ('sub-failed', 'parent', 'd', 'p', 'error', 'r', 5, 6),
                 ('sub-running', 'parent', 'd', 'p', 'running', NULL, 7, NULL);
             INSERT INTO acp_agent_sessions VALUES
                 ('parent', 'claude', 'shared', 10),
                 ('sub-done', 'claude', 'shared', 20);",
        )
        .unwrap();
        // Land on v1's shape first: v2 is the migration under test.
        conn.pragma_update(None, "user_version", 1).unwrap();

        run(&conn);

        let row = |id: &str| -> (Option<String>, i64, Option<String>, String, String) {
            conn.query_row(
                "SELECT owner_conversation_id, hidden, role, lifecycle, project_root
                 FROM conversations WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap()
        };
        assert_eq!(
            row("parent"),
            (None, 0, None, "idle".into(), "/proj".into())
        );
        let (owner, hidden, role, lifecycle, _) = row("sub-done");
        assert_eq!(owner.as_deref(), Some("parent"));
        assert_eq!((hidden, role.as_deref()), (1, Some("sub-agent")));
        assert_eq!(lifecycle, "stopped");
        assert_eq!(row("sub-failed").3, "failed");
        assert_eq!(row("sub-running").3, "running");
        // A sub-agent that never wrote a message still gets a row, in its
        // parent's project.
        assert_eq!(row("sub-failed").4, "/proj");

        let sessions: i64 = conn
            .query_row("SELECT count(*) FROM acp_agent_sessions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(sessions, 1, "the duplicate agent session id is deduped");
        let kept: String = conn
            .query_row("SELECT conversation_id FROM acp_agent_sessions", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(kept, "sub-done", "the most recently written row wins");
        assert!(conn
            .execute(
                "INSERT INTO acp_agent_sessions VALUES ('other', 'claude', 'shared', 30)",
                []
            )
            .is_err());
    }
}
