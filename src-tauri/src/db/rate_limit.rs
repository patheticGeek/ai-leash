//! `rate_limit_resumes` table access, plus the "last message" lookup the
//! Claude session-limit detection reads — see `acp/rate_limit.rs`. A row
//! records the user's answer to the auto-resume banner for one specific
//! notice message, so a later notice in the same conversation is asked
//! about afresh instead of inheriting a stale answer.

use super::Db;
use rusqlite::params;

pub struct LastMessage {
    pub id: i64,
    pub role: String,
    pub content: String,
    pub created_at: i64,
}

pub fn last_message(db: &Db, conversation_id: &str) -> Option<LastMessage> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT id, role, content, created_at FROM messages WHERE conversation_id = ?1 ORDER BY id DESC LIMIT 1",
        params![conversation_id],
        |row| {
            Ok(LastMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
            })
        },
    )
    .ok()
}

/// `(message_id, armed)` of the recorded answer, if any.
pub fn get_rate_limit_choice(db: &Db, conversation_id: &str) -> Option<(i64, bool)> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT message_id, armed FROM rate_limit_resumes WHERE conversation_id = ?1",
        params![conversation_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .ok()
}

pub fn set_rate_limit_choice(db: &Db, conversation_id: &str, message_id: i64, armed: bool) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "INSERT INTO rate_limit_resumes (conversation_id, message_id, armed) VALUES (?1, ?2, ?3)
         ON CONFLICT(conversation_id) DO UPDATE SET message_id = ?2, armed = ?3",
        params![conversation_id, message_id, armed],
    );
}

pub fn armed_rate_limit_conversations(db: &Db) -> Vec<String> {
    let conn = db.0.lock().unwrap();
    conn.prepare("SELECT conversation_id FROM rate_limit_resumes WHERE armed = 1")
        .and_then(|mut stmt| stmt.query_map([], |row| row.get(0))?.collect())
        .unwrap_or_default()
}
