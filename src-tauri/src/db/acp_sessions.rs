//! `acp_agent_sessions` table access — remembers, per (conversation,
//! launch_command), the agent-native session id an ACP agent handed back
//! from `session/new`, so a later connection can offer it to `session/load`
//! instead of always starting the agent with a blank context. Keyed by
//! `launch_command` too, not just `conversation_id`, since one conversation
//! can switch ACP agents over its lifetime (see `ensure_acp_session`'s doc
//! comment in `acp/process.rs`) and each agent has its own independent
//! session store — Claude Code's session id means nothing to Copilot's.

use super::{now, Db};
use rusqlite::params;

/// A session id minted by an ACP agent (the `sessionId` in its `session/new`
/// response). Distinct from ai-leash's own conversation id, which is what
/// every event name, `AppState` map and DB table keys on — this one only ever
/// crosses the wire to the agent (`session/load`, `session/prompt`,
/// `session/cancel`) and is stored here. A newtype rather than a bare
/// `String` so it can't be passed where a conversation id is expected (or the
/// reverse): both are strings, and `get_acp_agent_session_id`'s neighbours
/// take several of them positionally.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentSessionId(String);

impl AgentSessionId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Looks up the agent-native session id last stored for this
/// conversation/agent pair, if any.
pub fn get_acp_agent_session_id(
    db: &Db,
    conversation_id: &str,
    launch_command: &str,
) -> Option<AgentSessionId> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT agent_session_id FROM acp_agent_sessions WHERE conversation_id = ?1 AND launch_command = ?2",
        params![conversation_id, launch_command],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .map(AgentSessionId::new)
}

/// Records the agent-native session id handed back by a fresh
/// `session/new` call, so the next connection for this conversation/agent
/// pair can try to resume it instead.
pub fn set_acp_agent_session_id(
    db: &Db,
    conversation_id: &str,
    launch_command: &str,
    agent_session_id: &AgentSessionId,
) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "INSERT INTO acp_agent_sessions (conversation_id, launch_command, agent_session_id, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(conversation_id, launch_command) DO UPDATE SET agent_session_id = ?3, updated_at = ?4",
        params![
            conversation_id,
            launch_command,
            agent_session_id.as_str(),
            now()
        ],
    );
}

/// Drops a stored agent-native session id — called once `session/load`
/// rejects it (expired or otherwise unknown to the agent now), so the next
/// connection attempt for this conversation/agent pair falls straight
/// through to `session/new` instead of repeating the same failed resume.
pub fn delete_acp_agent_session_id(db: &Db, conversation_id: &str, launch_command: &str) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "DELETE FROM acp_agent_sessions WHERE conversation_id = ?1 AND launch_command = ?2",
        params![conversation_id, launch_command],
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        Db::open(path)
    }

    #[test]
    fn round_trips_the_stored_session_id() {
        let db = temp_db();
        assert_eq!(get_acp_agent_session_id(&db, "/proj", "claude-code"), None);

        set_acp_agent_session_id(
            &db,
            "/proj",
            "claude-code",
            &AgentSessionId::new("agent-sess-1"),
        );
        assert_eq!(
            get_acp_agent_session_id(&db, "/proj", "claude-code"),
            Some(AgentSessionId::new("agent-sess-1"))
        );
    }

    #[test]
    fn scopes_by_launch_command_independently() {
        let db = temp_db();
        set_acp_agent_session_id(
            &db,
            "/proj",
            "claude-code",
            &AgentSessionId::new("claude-sess"),
        );
        set_acp_agent_session_id(
            &db,
            "/proj",
            "copilot",
            &AgentSessionId::new("copilot-sess"),
        );

        assert_eq!(
            get_acp_agent_session_id(&db, "/proj", "claude-code"),
            Some(AgentSessionId::new("claude-sess"))
        );
        assert_eq!(
            get_acp_agent_session_id(&db, "/proj", "copilot"),
            Some(AgentSessionId::new("copilot-sess"))
        );
    }

    #[test]
    fn a_later_set_overwrites_the_prior_id_for_the_same_pair() {
        let db = temp_db();
        set_acp_agent_session_id(&db, "/proj", "claude-code", &AgentSessionId::new("first"));
        set_acp_agent_session_id(&db, "/proj", "claude-code", &AgentSessionId::new("second"));
        assert_eq!(
            get_acp_agent_session_id(&db, "/proj", "claude-code"),
            Some(AgentSessionId::new("second"))
        );
    }

    #[test]
    fn delete_clears_only_the_targeted_pair() {
        let db = temp_db();
        set_acp_agent_session_id(
            &db,
            "/proj",
            "claude-code",
            &AgentSessionId::new("claude-sess"),
        );
        set_acp_agent_session_id(
            &db,
            "/proj",
            "copilot",
            &AgentSessionId::new("copilot-sess"),
        );

        delete_acp_agent_session_id(&db, "/proj", "claude-code");

        assert_eq!(get_acp_agent_session_id(&db, "/proj", "claude-code"), None);
        assert_eq!(
            get_acp_agent_session_id(&db, "/proj", "copilot"),
            Some(AgentSessionId::new("copilot-sess"))
        );
    }
}
