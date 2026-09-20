//! `sub_agents` table access — start/finish lifecycle bookkeeping and the
//! list/lookup queries the Sub Agents sidebar and `spawn_sub_agent` tool use.
//! A sub-agent's actual transcript lives in `messages`/`conversations` like
//! any other session (keyed by its own id as `conversation_id`); this table
//! only tracks its metadata.

use super::{now, Db};
use rusqlite::{params, Connection};
use serde::Serialize;

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
    pub model: String,
    pub effort: Option<String>,
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
    model: &str,
    effort: Option<&str>,
) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "INSERT INTO sub_agents (id, parent_session_id, description, prompt, status, started_at, model, effort) VALUES (?1, ?2, ?3, ?4, 'running', ?5, ?6, ?7)",
        params![id, parent_session_id, description, prompt, now(), model, effort],
    );
}

pub fn record_sub_agent_finished(db: &Db, id: &str, status: &str, result: &str) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "UPDATE sub_agents SET status = ?1, result = ?2, finished_at = ?3 WHERE id = ?4",
        params![status, result, now(), id],
    );
}

fn query_sub_agents(
    conn: &Connection,
    where_clause: &str,
    params: &[&dyn rusqlite::ToSql],
) -> Vec<SubAgentSummary> {
    let sql = format!(
        "SELECT id, parent_session_id, description, status, started_at, finished_at, model, effort FROM sub_agents {where_clause} ORDER BY started_at DESC"
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
        "WHERE parent_session_id = ?1",
        params![parent_session_id],
    );
    items.truncate(limit);
    items
}

/// Removes every row a sub-agent owns: its transcript (`messages`/
/// `conversations`), any stored agent-native session id
/// (`acp_agent_sessions`) and its own `sub_agents` row. The one place that
/// knows that list, shared by `delete_sub_agent` (a single finished one) and
/// `conversations.rs`'s whole-conversation wipe (every one a parent spawned),
/// so a new table keyed by a sub-agent's id only needs adding here.
pub(super) fn wipe_sub_agent(conn: &Connection, id: &str) {
    for sql in [
        "DELETE FROM messages WHERE conversation_id = ?1",
        "DELETE FROM conversations WHERE id = ?1",
        "DELETE FROM acp_agent_sessions WHERE conversation_id = ?1",
        "DELETE FROM sub_agents WHERE id = ?1",
    ] {
        let _ = conn.execute(sql, params![id]);
    }
}

/// Deletes one sub-agent and everything it owns (see `wipe_sub_agent`).
/// Intended for finished (`done`/`error`) sub-agents only — the frontend's
/// delete button only offers this once a sub-agent is no longer `running`,
/// since a still-running one may still be writing messages for this id and
/// would otherwise resurrect a row right after this deletes it.
pub fn delete_sub_agent(db: &Db, id: &str) {
    let conn = db.0.lock().unwrap();
    wipe_sub_agent(&conn, id);
}

/// Looks up `id` only if it was spawned by `parent_session_id` — a
/// conversation can never read another's sub-agent, even given its exact id.
pub fn get_sub_agent_for_parent(
    db: &Db,
    parent_session_id: &str,
    id: &str,
) -> Option<SubAgentMeta> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT prompt, status FROM sub_agents WHERE id = ?1 AND parent_session_id = ?2",
        params![id, parent_session_id],
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

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        Db::open(path)
    }

    #[test]
    fn delete_sub_agent_drops_its_stored_acp_session() {
        use crate::db::{get_acp_agent_session_id, set_acp_agent_session_id, AgentSessionId};

        let db = temp_db();
        let sub = "sub-abc";
        record_sub_agent_started(&db, sub, "/proj", "d", "p", "m", None);
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
        record_sub_agent_started(&db, "sub-1", "/proj-a", "d", "the prompt", "m", None);

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
            "count the files",
            "llama3",
            Some("high"),
        );

        let running = list_sub_agents_for_parent(&db, "/proj", 50);
        assert_eq!(running.len(), 1);
        assert_eq!(running[0].status, "running");
        assert!(running[0].finished_at.is_none());
        assert_eq!(running[0].model, "llama3");
        assert_eq!(running[0].effort.as_deref(), Some("high"));

        record_sub_agent_finished(&db, "sub-abc", "done", "there are 3 files");

        let meta = get_sub_agent_for_parent(&db, "/proj", "sub-abc").expect("sub-agent exists");
        assert_eq!(meta.status, "done");
        assert_eq!(meta.prompt, "count the files");

        let finished = list_sub_agents_for_parent(&db, "/proj", 50);
        assert_eq!(finished[0].status, "done");
        assert!(finished[0].finished_at.is_some());
    }

    #[test]
    fn list_sub_agents_for_parent_stays_isolated_per_parent() {
        let db = temp_db();
        record_sub_agent_started(&db, "sub-1", "/proj-a", "task a", "do a", "llama3", None);
        record_sub_agent_started(&db, "sub-2", "/proj-b", "task b", "do b", "llama3", None);

        assert_eq!(list_sub_agents_for_parent(&db, "/proj-a", 50).len(), 1);
        assert_eq!(list_sub_agents_for_parent(&db, "/proj-b", 50).len(), 1);
    }
}
