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

const MIGRATIONS: &[Migration] = &[
    v1_legacy_columns,
    v2_conversation_graph,
    v3_drop_sub_agents,
    v4_backend_ids,
    v5_agent_mode,
    v6_project_boards,
    v7_agent_defaults,
];

/// The version `v3_drop_sub_agents` leaves a database at — `Db::open`'s
/// baseline schema checks this before creating `sub_agents`, since v1/v2
/// still need to see it on a database that hasn't reached v3 yet, but
/// `CREATE TABLE IF NOT EXISTS` would otherwise silently bring an empty,
/// unused copy back on every launch of a database that already dropped it.
pub(super) const DROPS_SUB_AGENTS_AT_VERSION: usize = 3;

pub(super) fn user_version(conn: &Connection) -> usize {
    conn.pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("failed to read schema version")
}

pub(super) fn run(conn: &Connection) {
    let current: usize = user_version(conn);
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

/// Retires the `sub_agents` table now that everything it held has a home on
/// `conversations`/`messages` directly (see PLAN.md's "Schema" section,
/// 2c) — `status` is `lifecycle` (already written there by v2), `model`/
/// `effort` are those columns, `started_at` is `created_at`, `description`
/// is `title` (unused by a hidden sub-agent row otherwise), and `prompt` is
/// the transcript's own first user message.
///
/// `result` needs one step of care: `chat::run_sub_agent`/
/// `AcpBackend::run_task` push it as a real assistant message going
/// forward (so it's always just "the last message"), but that's a Rust
/// change, not a schema one — it says nothing about sub-agents that already
/// finished before this shipped. For those, this backfills the same message
/// directly, skipping any row whose transcript already ends with it (the
/// common case: a sub-agent that returned real text).
fn v3_drop_sub_agents(conn: &Connection) {
    conn.execute_batch(
        "
        ALTER TABLE conversations ADD COLUMN finished_at INTEGER;

        INSERT INTO messages (conversation_id, role, content, tool_calls, created_at)
        SELECT s.id, 'assistant', s.result, NULL, coalesce(s.finished_at, s.started_at)
        FROM sub_agents s
        WHERE s.result IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM messages m
              WHERE m.conversation_id = s.id
                AND m.id = (SELECT MAX(id) FROM messages WHERE conversation_id = s.id)
                AND m.role = 'assistant'
                AND m.content = s.result
          );

        UPDATE conversations
            SET finished_at = (SELECT finished_at FROM sub_agents WHERE sub_agents.id = conversations.id)
            WHERE id IN (SELECT id FROM sub_agents WHERE finished_at IS NOT NULL);

        UPDATE conversations
            SET title = (SELECT description FROM sub_agents WHERE sub_agents.id = conversations.id)
            WHERE title IS NULL AND id IN (SELECT id FROM sub_agents);

        DROP TABLE sub_agents;
        ",
    )
    .expect("failed to retire the sub_agents table");
}

/// `conversations.backend` held a small JSON reference —
/// `{"kind":"builtin","providerId":…}` or `{"kind":"acp","acpId":…}` —
/// written by the frontend. Backends now live in one registry
/// (`backend::registry`) where every id is unique across kinds, so the
/// column holds just the id. Anything unparseable is cleared, which makes
/// that conversation start from the default backend.
/// An ACP agent's own mode (its `mode` config option — e.g. Claude Code's
/// "Accept Edits"), remembered per conversation next to `model`/`effort`.
/// Separate from `permission_mode`, AI Leash's own Ask/Bypass, which still
/// applies to backends that don't advertise modes.
fn v5_agent_mode(conn: &Connection) {
    conn.execute("ALTER TABLE conversations ADD COLUMN agent_mode TEXT", [])
        .expect("failed to add conversations.agent_mode");
}

/// Project boards: `epics` and `tasks`, both owned by a `projects` row, plus
/// the per-project counter behind a task's short `#N` and the opt-in for
/// running several tasks at once in a non-git project's only checkout. See
/// `db/tasks.rs`.
///
/// `projects` is part of `Db::open`'s baseline schema, so it already exists
/// in any real database; it's only created here for databases built by hand
/// (the tests below) that predate it.
fn v6_project_boards(conn: &Connection) {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
             id TEXT PRIMARY KEY,
             root_path TEXT NOT NULL UNIQUE,
             name TEXT NOT NULL,
             created_at INTEGER NOT NULL,
             updated_at INTEGER NOT NULL,
             last_opened_at INTEGER
         )",
        [],
    )
    .expect("failed to create projects");
    conn.execute_batch(
        "
        ALTER TABLE projects ADD COLUMN next_task_number INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE projects ADD COLUMN parallel_main_checkout_tasks INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE epics (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL,
            position REAL NOT NULL,
            archived INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_epics_project ON epics(project_id, position);

        CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            epic_id TEXT,
            number INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            priority TEXT NOT NULL,
            effort TEXT,
            position REAL NOT NULL,
            conversation_id TEXT,
            engaged_with_project INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            started_at INTEGER,
            completed_at INTEGER,
            UNIQUE (project_id, number)
        );
        CREATE INDEX idx_tasks_project_status ON tasks(project_id, status, position);
        CREATE INDEX idx_tasks_conversation ON tasks(conversation_id);
        ",
    )
    .expect("failed to create project board tables");
}

/// Which agent a board task's chat starts with — per task, and per project
/// as the board's default. A small JSON object (`db::AgentDefaults`), since
/// its parts only mean anything together (a model belongs to a backend).
fn v7_agent_defaults(conn: &Connection) {
    conn.execute_batch(
        "
        ALTER TABLE tasks ADD COLUMN agent_defaults TEXT;
        ALTER TABLE projects ADD COLUMN board_agent_defaults TEXT;
        ",
    )
    .expect("failed to add agent defaults");
}

fn v4_backend_ids(conn: &Connection) {
    let rows: Vec<(String, String)> = conn
        .prepare("SELECT id, backend FROM conversations WHERE backend IS NOT NULL")
        .and_then(|mut stmt| {
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect()
        })
        .expect("failed to read conversation backends");
    for (id, backend) in rows {
        let value: Option<serde_json::Value> = serde_json::from_str(&backend).ok();
        let backend_id = value.as_ref().and_then(|v| {
            v.get("providerId")
                .or_else(|| v.get("acpId"))
                .and_then(serde_json::Value::as_str)
                .filter(|id| !id.is_empty())
        });
        conn.execute(
            "UPDATE conversations SET backend = ?2 WHERE id = ?1",
            rusqlite::params![id, backend_id],
        )
        .expect("failed to rewrite a conversation backend");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
            ("conversations", "owner_conversation_id"),
            ("conversations", "finished_at"),
            ("messages", "duration_seconds"),
        ] {
            assert!(has_column(&conn, table, column), "{table}.{column}");
        }
        assert!(!has_column(&conn, "conversations", "branch_name"));
        // v1 adds sub_agents.model/effort (needed by v2's backfill) and v3
        // drops the table outright once nothing reads it anymore — by the
        // time every migration's run, it should simply be gone.
        let table_exists: bool = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'sub_agents'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .map(|n| n > 0)
            .unwrap();
        assert!(!table_exists);
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
                 project_id TEXT, title TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
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

    #[test]
    fn v4_turns_backend_references_into_ids() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE conversations (id TEXT PRIMARY KEY, project_root TEXT NOT NULL,
                 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, backend TEXT);
             INSERT INTO conversations VALUES
                 ('native', '/p', 1, 1, '{\"kind\":\"builtin\",\"providerId\":\"ollama-default\"}'),
                 ('agent', '/p', 1, 1, '{\"kind\":\"acp\",\"acpId\":\"acp-preset-claude-code\"}'),
                 ('junk', '/p', 1, 1, 'not json'),
                 ('unset', '/p', 1, 1, NULL);",
        )
        .unwrap();
        v4_backend_ids(&conn);
        let backend = |id: &str| -> Option<String> {
            conn.query_row(
                "SELECT backend FROM conversations WHERE id = ?1",
                [id],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert_eq!(backend("native").as_deref(), Some("ollama-default"));
        assert_eq!(backend("agent").as_deref(), Some("acp-preset-claude-code"));
        assert_eq!(backend("junk"), None);
        assert_eq!(backend("unset"), None);
    }

    #[test]
    fn v3_backfills_a_missing_final_message_and_drops_sub_agents() {
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
             INSERT INTO conversations (id, project_root, created_at, updated_at)
                 VALUES ('parent', '/proj', 1, 2);
             INSERT INTO sub_agents VALUES
                 ('answered', 'parent', 'count files', 'count the files', 'done', 'there are 3 files', 10, 20),
                 ('silent', 'parent', 'explain', 'explain the moon landing', 'done',
                  'Subtask finished without a final response.', 30, 40),
                 ('errored', 'parent', 'break', 'break something', 'error', 'Error: boom', 50, 60);
             INSERT INTO messages (conversation_id, role, content, created_at) VALUES
                 ('answered', 'user', 'count the files', 10),
                 ('answered', 'assistant', 'there are 3 files', 15),
                 ('silent', 'user', 'explain the moon landing', 30),
                 ('errored', 'user', 'break something', 50);",
        )
        .unwrap();

        run(&conn);

        let messages = |id: &str| -> Vec<(String, String)> {
            conn.prepare(
                "SELECT role, content FROM messages WHERE conversation_id = ?1 ORDER BY id",
            )
            .unwrap()
            .query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap()
        };
        // Already ends with its real answer — nothing added.
        assert_eq!(
            messages("answered"),
            vec![
                ("user".into(), "count the files".into()),
                ("assistant".into(), "there are 3 files".into()),
            ]
        );
        // Its stored result wasn't a real message — backfilled as one.
        assert_eq!(
            messages("silent"),
            vec![
                ("user".into(), "explain the moon landing".into()),
                (
                    "assistant".into(),
                    "Subtask finished without a final response.".into()
                ),
            ]
        );
        assert_eq!(
            messages("errored"),
            vec![
                ("user".into(), "break something".into()),
                ("assistant".into(), "Error: boom".into()),
            ]
        );

        let row = |id: &str| -> (Option<i64>, Option<String>) {
            conn.query_row(
                "SELECT finished_at, title FROM conversations WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap()
        };
        assert_eq!(row("answered"), (Some(20), Some("count files".into())));
        assert_eq!(row("silent"), (Some(40), Some("explain".into())));
        assert_eq!(row("errored"), (Some(60), Some("break".into())));

        let table_exists: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'sub_agents'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(table_exists, 0);
    }
}
