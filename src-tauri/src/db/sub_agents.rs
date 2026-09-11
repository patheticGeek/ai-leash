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

fn query_sub_agents(
    conn: &Connection,
    where_clause: &str,
    params: &[&dyn rusqlite::ToSql],
) -> Vec<SubAgentSummary> {
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

/// Cross-project — the Sub Agents sidebar's own scope (it's a global
/// history, not scoped to the currently open project). Capped at a generous
/// but bounded count so a very long-lived app doesn't load an unbounded list.
pub fn list_all_sub_agents(db: &Db) -> Vec<SubAgentSummary> {
    let conn = db.0.lock().unwrap();
    let mut items = query_sub_agents(&conn, "", params![]);
    items.truncate(500);
    items
}

/// Deletes one sub-agent's `sub_agents` row plus its own `messages`/
/// `conversations` rows (same per-row deletion `clear_conversation` does for
/// each of a parent's sub-agents, just for a single id instead of every one
/// under a parent). Intended for finished (`done`/`error`) sub-agents only —
/// the frontend's delete button only offers this once a sub-agent is no
/// longer `running`, since a still-running one may still be writing messages
/// for this id and would otherwise resurrect a row right after this deletes it.
pub fn delete_sub_agent(db: &Db, id: &str) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "DELETE FROM messages WHERE conversation_id = ?1",
        params![id],
    );
    let _ = conn.execute("DELETE FROM conversations WHERE id = ?1", params![id]);
    let _ = conn.execute("DELETE FROM sub_agents WHERE id = ?1", params![id]);
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

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        Db::open(path)
    }

    #[test]
    fn records_and_finishes_sub_agent_lifecycle() {
        let db = temp_db();
        record_sub_agent_started(
            &db,
            "/proj::spawn_sub_agent::abc",
            "/proj",
            "count files",
            "count the files",
        );

        let running = list_sub_agents_for_parent(&db, "/proj", 50);
        assert_eq!(running.len(), 1);
        assert_eq!(running[0].status, "running");
        assert!(running[0].finished_at.is_none());

        record_sub_agent_finished(
            &db,
            "/proj::spawn_sub_agent::abc",
            "done",
            "there are 3 files",
        );

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
        record_sub_agent_started(
            &db,
            "/proj-a::spawn_sub_agent::1",
            "/proj-a",
            "task a",
            "do a",
        );
        record_sub_agent_started(
            &db,
            "/proj-b::spawn_sub_agent::2",
            "/proj-b",
            "task b",
            "do b",
        );

        assert_eq!(list_all_sub_agents(&db).len(), 2);
        assert_eq!(list_sub_agents_for_parent(&db, "/proj-a", 50).len(), 1);
        assert_eq!(list_sub_agents_for_parent(&db, "/proj-b", 50).len(), 1);
    }
}
