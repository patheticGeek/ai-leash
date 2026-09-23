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

const MIGRATIONS: &[Migration] = &[v1_legacy_columns];

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
                 result TEXT, started_at INTEGER NOT NULL, finished_at INTEGER);",
        )
        .unwrap();
        run(&conn);
        run(&conn);
        assert_eq!(user_version(&conn), MIGRATIONS.len());
    }
}
