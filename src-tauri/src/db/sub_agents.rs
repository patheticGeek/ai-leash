//! Sub-agent queries. A sub-agent is just a `conversations` row owned by
//! whoever spawned it (`owner_conversation_id`), `hidden` from the sidebar,
//! `role = 'sub-agent'` (see `record_sub_agent_started`) — its transcript
//! lives in `messages` like any other session, its prompt is that
//! transcript's own first user message, and its result is guaranteed (by
//! `chat::run_sub_agent`/`acp::run_sub_agent_acp`, which push a message for
//! it either way, even a synthesized "no response"/error one) to be the
//! last assistant one. There used to be a dedicated `sub_agents` table for
//! this; migration v3 retired it once every field it held had a home here
//! instead (see `db/migrations.rs`'s doc comment on `v3_drop_sub_agents`).
//! This file is only the handful of queries the Sub Agents sidebar and
//! `spawn_sub_agent`/`read_sub_agent` tools need shaped around that.

use super::conversations::wipe_conversation_and_sub_agents;
use super::{now, Db};
use rusqlite::{params, Connection};
use serde::Serialize;

/// One row of `list_sub_agents_for_parent` — as shown in the Sub Agents
/// sidebar.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentSummary {
    pub id: String,
    pub parent_session_id: String,
    pub description: String,
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub model: String,
    pub effort: Option<String>,
}

pub struct SubAgentMeta {
    pub prompt: String,
    pub status: String,
}

/// `conversations.lifecycle` ("idle|running|waiting|stopped|failed|archived",
/// shared with every other conversation) read back as the narrower
/// "running"|"done"|"error" the frontend's `SubAgentSummary`/`SubAgentMeta`
/// have always used. `"stopped"` (the normal finished case) and anything
/// unexpected both read as `"done"` rather than silently dropping the row.
fn status_from_lifecycle(lifecycle: &str) -> String {
    match lifecycle {
        "running" => "running",
        "failed" => "error",
        _ => "done",
    }
    .to_string()
}

/// Records a sub-agent starting: its conversation row, owned by
/// `parent_session_id`, hidden from the sidebar, `role = 'sub-agent'`. The
/// row is written here rather than left to the sub-agent's first message so
/// ownership never depends on write order (`messages::save_message`'s
/// upsert leaves these columns alone). `description` doubles as the row's
/// `title` — a hidden sub-agent has no other use for one.
pub fn record_sub_agent_started(
    db: &Db,
    id: &str,
    parent_session_id: &str,
    description: &str,
    model: &str,
    effort: Option<&str>,
) {
    let conn = db.0.lock().unwrap();
    let ts = now();
    let (project_root, project_id): (String, Option<String>) = conn
        .query_row(
            "SELECT project_root, project_id FROM conversations WHERE id = ?1",
            params![parent_session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or_default();
    let _ = conn.execute(
        "INSERT INTO conversations
         (id, project_root, project_id, created_at, updated_at,
          owner_conversation_id, hidden, role, lifecycle, title, model, effort)
         VALUES (?1, ?2, ?3, ?4, ?4, ?5, 1, 'sub-agent', 'running', ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
             owner_conversation_id = ?5, hidden = 1, role = 'sub-agent', lifecycle = 'running',
             title = ?6, model = ?7, effort = ?8",
        params![
            id,
            project_root,
            project_id,
            ts,
            parent_session_id,
            description,
            model,
            effort
        ],
    );
}

/// Records a sub-agent finishing. Callers (`chat::run_sub_agent`,
/// `acp::run_sub_agent_acp`) already guarantee the transcript's own last
/// message is whatever result they're about to hand back to their caller —
/// this only needs to flip `lifecycle` and stamp `finished_at`.
pub fn record_sub_agent_finished(db: &Db, id: &str, status: &str) {
    let conn = db.0.lock().unwrap();
    let lifecycle = if status == "error" {
        "failed"
    } else {
        "stopped"
    };
    let _ = conn.execute(
        "UPDATE conversations SET lifecycle = ?1, finished_at = ?2 WHERE id = ?3",
        params![lifecycle, now(), id],
    );
}

fn query_sub_agents(
    conn: &Connection,
    where_clause: &str,
    params: &[&dyn rusqlite::ToSql],
) -> Vec<SubAgentSummary> {
    let sql = format!(
        "SELECT id, owner_conversation_id, title, lifecycle, created_at, finished_at, model, effort \
         FROM conversations {where_clause} ORDER BY created_at DESC"
    );
    let Ok(mut stmt) = conn.prepare(&sql) else {
        return vec![];
    };
    let rows = stmt.query_map(params, |row| {
        let lifecycle: String = row.get(3)?;
        Ok(SubAgentSummary {
            id: row.get(0)?,
            parent_session_id: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            description: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            status: status_from_lifecycle(&lifecycle),
            started_at: row.get(4)?,
            finished_at: row.get(5)?,
            model: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
            effort: row.get(7)?,
        })
    });
    match rows {
        Ok(iter) => iter.filter_map(Result::ok).collect(),
        Err(_) => vec![],
    }
}

pub fn list_sub_agents_for_parent(
    db: &Db,
    parent_session_id: &str,
    limit: usize,
) -> Vec<SubAgentSummary> {
    let conn = db.0.lock().unwrap();
    let mut items = query_sub_agents(
        &conn,
        "WHERE owner_conversation_id = ?1 AND role = 'sub-agent'",
        params![parent_session_id],
    );
    items.truncate(limit);
    items
}

/// Deletes one sub-agent and everything it owns (see
/// `conversations::wipe_conversation_and_sub_agents`). Intended for finished
/// (`done`/`error`) sub-agents only — the frontend's delete button only
/// offers this once a sub-agent is no longer `running`, since a still-running
/// one may still be writing messages for this id and would otherwise
/// resurrect a row right after this deletes it.
pub fn delete_sub_agent(db: &Db, id: &str) {
    let conn = db.0.lock().unwrap();
    wipe_conversation_and_sub_agents(&conn, id);
}

/// Looks up `id` only if it was spawned by `parent_session_id` — a
/// conversation can never read another's sub-agent, even given its exact id.
/// `prompt` is the transcript's own first user message (empty in the brief
/// window between `record_sub_agent_started` and that message actually
/// landing — self-healing, nothing reads it that fast in practice).
pub fn get_sub_agent_for_parent(
    db: &Db,
    parent_session_id: &str,
    id: &str,
) -> Option<SubAgentMeta> {
    let conn = db.0.lock().unwrap();
    let lifecycle: String = conn
        .query_row(
            "SELECT lifecycle FROM conversations
             WHERE id = ?1 AND owner_conversation_id = ?2 AND role = 'sub-agent'",
            params![id, parent_session_id],
            |row| row.get(0),
        )
        .ok()?;
    let prompt: String = conn
        .query_row(
            "SELECT content FROM messages WHERE conversation_id = ?1 AND role = 'user' \
             ORDER BY id ASC LIMIT 1",
            params![id],
            |row| row.get(0),
        )
        .unwrap_or_default();
    Some(SubAgentMeta {
        prompt,
        status: status_from_lifecycle(&lifecycle),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat::ChatMessage;
    use crate::db::save_message;

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        Db::open(path)
    }

    fn push(db: &Db, conversation_id: &str, role: &str, content: &str) {
        save_message(
            db,
            conversation_id,
            "/proj",
            &ChatMessage {
                role: role.into(),
                content: content.into(),
                tool_calls: None,
            },
        );
    }

    #[test]
    fn delete_sub_agent_drops_its_stored_acp_session() {
        use crate::db::{get_acp_agent_session_id, set_acp_agent_session_id, AgentSessionId};

        let db = temp_db();
        let sub = "sub-abc";
        record_sub_agent_started(&db, sub, "/proj", "d", "m", None);
        set_acp_agent_session_id(&db, sub, "claude-code", &AgentSessionId::new("sub-sess"));
        set_acp_agent_session_id(
            &db,
            "/proj",
            "claude-code",
            &AgentSessionId::new("parent-sess"),
        );

        delete_sub_agent(&db, sub);

        assert_eq!(get_acp_agent_session_id(&db, sub, "claude-code"), None);
        assert_eq!(
            get_acp_agent_session_id(&db, "/proj", "claude-code"),
            Some(AgentSessionId::new("parent-sess"))
        );
    }

    #[test]
    fn get_sub_agent_for_parent_never_returns_another_parents_sub_agent() {
        let db = temp_db();
        record_sub_agent_started(&db, "sub-1", "/proj-a", "d", "m", None);
        push(&db, "sub-1", "user", "the prompt");

        let meta = get_sub_agent_for_parent(&db, "/proj-a", "sub-1").expect("owned sub-agent");
        assert_eq!(meta.prompt, "the prompt");
        assert!(get_sub_agent_for_parent(&db, "/proj-b", "sub-1").is_none());
        assert!(get_sub_agent_for_parent(&db, "/proj-a", "sub-").is_none());
    }

    #[test]
    fn records_and_finishes_sub_agent_lifecycle() {
        let db = temp_db();
        record_sub_agent_started(
            &db,
            "sub-abc",
            "/proj",
            "count files",
            "llama3",
            Some("high"),
        );
        push(&db, "sub-abc", "user", "count the files");

        let running = list_sub_agents_for_parent(&db, "/proj", 50);
        assert_eq!(running.len(), 1);
        assert_eq!(running[0].status, "running");
        assert_eq!(running[0].description, "count files");
        assert!(running[0].finished_at.is_none());
        assert_eq!(running[0].model, "llama3");
        assert_eq!(running[0].effort.as_deref(), Some("high"));

        push(&db, "sub-abc", "assistant", "there are 3 files");
        record_sub_agent_finished(&db, "sub-abc", "done");

        let meta = get_sub_agent_for_parent(&db, "/proj", "sub-abc").expect("sub-agent exists");
        assert_eq!(meta.status, "done");
        assert_eq!(meta.prompt, "count the files");

        let finished = list_sub_agents_for_parent(&db, "/proj", 50);
        assert_eq!(finished[0].status, "done");
        assert!(finished[0].finished_at.is_some());
    }

    #[test]
    fn an_errored_sub_agent_reads_as_error() {
        let db = temp_db();
        record_sub_agent_started(&db, "sub-1", "/proj", "d", "m", None);
        record_sub_agent_finished(&db, "sub-1", "error");

        assert_eq!(
            list_sub_agents_for_parent(&db, "/proj", 50)[0].status,
            "error"
        );
        assert_eq!(
            get_sub_agent_for_parent(&db, "/proj", "sub-1")
                .unwrap()
                .status,
            "error"
        );
    }

    #[test]
    fn list_sub_agents_for_parent_stays_isolated_per_parent() {
        let db = temp_db();
        record_sub_agent_started(&db, "sub-1", "/proj-a", "task a", "llama3", None);
        record_sub_agent_started(&db, "sub-2", "/proj-b", "task b", "llama3", None);

        assert_eq!(list_sub_agents_for_parent(&db, "/proj-a", 50).len(), 1);
        assert_eq!(list_sub_agents_for_parent(&db, "/proj-b", 50).len(), 1);
    }
}
