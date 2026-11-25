//! `rate_limits` table access — see `acp/rate_limit.rs`. One row per
//! conversation holds the usage limit its last prompt failed on (recorded
//! from the ACP error, not inferred from the transcript) together with the
//! user's answer to the auto-resume banner for that limit. `armed` is `NULL`
//! until they answer; recording a new limit resets it, so a later limit is
//! asked about afresh instead of inheriting a stale answer.

use super::Db;
use rusqlite::params;

pub struct PendingRateLimit {
    pub reset_at_ms: i64,
    pub kind: Option<String>,
    pub message: String,
    /// `None` = not answered yet, `Some(true)` = auto-resume armed,
    /// `Some(false)` = declined.
    pub armed: Option<bool>,
}

pub fn get_pending_rate_limit(db: &Db, conversation_id: &str) -> Option<PendingRateLimit> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT reset_at_ms, kind, message, armed FROM rate_limits WHERE conversation_id = ?1",
        params![conversation_id],
        |row| {
            Ok(PendingRateLimit {
                reset_at_ms: row.get(0)?,
                kind: row.get(1)?,
                message: row.get(2)?,
                armed: row.get(3)?,
            })
        },
    )
    .ok()
}

/// Records a freshly hit limit, replacing any earlier one and its answer.
pub fn set_pending_rate_limit(
    db: &Db,
    conversation_id: &str,
    reset_at_ms: i64,
    kind: Option<&str>,
    message: &str,
) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "INSERT INTO rate_limits (conversation_id, reset_at_ms, kind, message, armed)
         VALUES (?1, ?2, ?3, ?4, NULL)
         ON CONFLICT(conversation_id) DO UPDATE
         SET reset_at_ms = ?2, kind = ?3, message = ?4, armed = NULL",
        params![conversation_id, reset_at_ms, kind, message],
    );
}

pub fn set_rate_limit_choice(db: &Db, conversation_id: &str, armed: bool) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "UPDATE rate_limits SET armed = ?2 WHERE conversation_id = ?1",
        params![conversation_id, armed],
    );
}

/// The limit is over: a new message went out or a turn completed.
pub fn clear_pending_rate_limit(db: &Db, conversation_id: &str) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "DELETE FROM rate_limits WHERE conversation_id = ?1",
        params![conversation_id],
    );
}

pub fn armed_rate_limit_conversations(db: &Db) -> Vec<String> {
    let conn = db.0.lock().unwrap();
    conn.prepare("SELECT conversation_id FROM rate_limits WHERE armed = 1")
        .and_then(|mut stmt| stmt.query_map([], |row| row.get(0))?.collect())
        .unwrap_or_default()
}
