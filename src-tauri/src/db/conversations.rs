//! `conversations` table access: the per-row upsert shared by every message
//! write (see `messages::save_message`/`start_streaming_message`), and
//! whole-conversation deletion, which cascades into everything it owns (see
//! `wipe_conversation_and_sub_agents`) — deleting a conversation isn't just a
//! `conversations` table op, so it lives here rather than being split across
//! files.

use super::messages::title_from_message;
use super::projects::ensure_project_connection;
use super::{now, Db};
use rusqlite::{params, Connection};
use serde::Serialize;

/// One row of `list_all_conversations` — everything the sidebar needs to
/// render a conversation without a second round trip.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub project_id: Option<String>,
    pub project_root: String,
    pub title: Option<String>,
    pub updated_at: i64,
    /// Whether the conversation has been marked done in the sidebar — see
    /// `set_conversation_done`. Purely a user-facing organizational flag,
    /// doesn't affect anything else about the conversation.
    pub done: bool,
    /// The conversation's own worktree path, if it was started in one
    /// instead of the primary checkout — see `set_conversation_worktree`.
    /// Never a branch name: what's checked out at this path can change from
    /// outside the app, so the frontend always reads the true current
    /// branch live (see `git::watch_git_branch`) instead of trusting a
    /// stored value.
    pub worktree_path: Option<String>,
    /// Which provider/ACP agent this conversation last talked to — a small
    /// JSON blob (`{"kind":"builtin","providerId":...}` or
    /// `{"kind":"acp","acpId":...}`), opaque to Rust — see
    /// `set_conversation_backend`.
    pub backend: Option<String>,
    /// That backend's own model/effort choice — meaningless without
    /// `backend`, so always read together.
    pub model: Option<String>,
    pub effort: Option<String>,
    /// Ask/Bypass tool-call permission choice ("ask" | "bypass") — see
    /// `tools::permissions::set_permission_mode`. Missing means "ask", same
    /// default as the in-memory enforcement side.
    pub permission_mode: Option<String>,
}

/// Every top-level conversation across every known project — the
/// sidebar's own scope. Deliberately NOT filtered by whichever project is
/// currently "open" (`state.project_root` is a single global value — see
/// `commands::set_project_root` — but the sidebar must show every
/// project's conversations regardless of which one is currently active).
/// Excludes `hidden` conversations — sub-agents (see
/// `tools::sub_agent_tools`) are hidden, and have their own dedicated Sub
/// Agents sidebar (`list_sub_agents_for_parent`, scoped to the active
/// conversation) instead.
pub fn list_all_conversations(db: &Db) -> Vec<ConversationSummary> {
    let conn = db.0.lock().unwrap();
    let Ok(mut stmt) = conn.prepare(
        "SELECT id, project_id, project_root, title, updated_at, worktree_path, done, \
                backend, model, effort, permission_mode \
         FROM conversations \
         WHERE hidden = 0 ORDER BY updated_at DESC",
    ) else {
        return vec![];
    };
    stmt.query_map([], |row| {
        Ok(ConversationSummary {
            id: row.get(0)?,
            project_id: row.get(1)?,
            project_root: row.get(2)?,
            title: row.get(3)?,
            updated_at: row.get(4)?,
            worktree_path: row.get(5)?,
            done: row.get(6)?,
            backend: row.get(7)?,
            model: row.get(8)?,
            effort: row.get(9)?,
            permission_mode: row.get(10)?,
        })
    })
    .map(|rows| rows.filter_map(Result::ok).collect())
    .unwrap_or_default()
}

/// Persists which backend/model this conversation is using — see
/// `ConversationSummary::backend`'s doc comment for the encoding. Upserts
/// like `set_conversation_worktree`: a conversation picks its backend before
/// it's sent its first message, when no row exists yet, and neither
/// `project_root` nor this choice are touched by `messages::save_message`'s
/// own upsert.
pub fn set_conversation_backend(
    db: &Db,
    conversation_id: &str,
    project_root: &str,
    backend: &str,
    model: Option<&str>,
    effort: Option<&str>,
) {
    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    let ts = now();
    let _ = conn.execute(
        "INSERT INTO conversations
         (id, project_root, project_id, backend, model, effort, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(id) DO UPDATE SET backend = ?4, model = ?5, effort = ?6",
        params![
            conversation_id,
            project_root,
            project_id,
            backend,
            model,
            effort,
            ts
        ],
    );
}

/// Persists the Ask/Bypass choice — see `ConversationSummary::permission_mode`
/// and `tools::permissions::set_permission_mode`, which calls this alongside
/// flipping the in-memory enforcement flag. Upserts for the same reason as
/// `set_conversation_backend`.
pub fn set_conversation_permission_mode(
    db: &Db,
    conversation_id: &str,
    project_root: &str,
    mode: &str,
) {
    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    let ts = now();
    let _ = conn.execute(
        "INSERT INTO conversations
         (id, project_root, project_id, permission_mode, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(id) DO UPDATE SET permission_mode = ?4",
        params![conversation_id, project_root, project_id, mode, ts],
    );
}

/// Deletes one conversation outright — its own row, `messages`, stored ACP
/// session id, and (since a sub-agent is owned by whichever conversation
/// spawned it — see `wipe_conversation_and_sub_agents`) every conversation it
/// owns, transitively, plus *their* own rows too. Distinct from
/// `clear_conversation` (the "/clear" command), which wipes the same rows
/// except the conversation's own, so it stays listed; this is "remove it
/// from the sidebar for good."
pub fn delete_conversation(db: &Db, conversation_id: &str) {
    let conn = db.0.lock().unwrap();
    wipe_conversation_and_sub_agents(&conn, conversation_id);
}

/// Inserts a conversation's row if it doesn't exist yet, or bumps its
/// `updated_at` if it does. Called by both `messages::save_message` and
/// `messages::start_streaming_message` since every write to a conversation's
/// messages also touches its own `conversations` bookkeeping row.
pub(super) fn upsert_conversation(
    conn: &Connection,
    conversation_id: &str,
    project_root: &str,
    ts: i64,
) {
    let project_id = ensure_project_connection(conn, project_root);
    let _ = conn.execute(
        "INSERT INTO conversations
         (id, project_root, project_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(id) DO UPDATE SET updated_at = ?4, project_root = ?2, project_id = ?3",
        params![conversation_id, project_root, project_id, ts],
    );
}

/// Persists the checkout chosen for a conversation — the primary checkout
/// (`worktree_path: None`) or a worktree path — independent of any message
/// having been sent yet, so a reload can restore the same cwd (see
/// `commands::set_conversation_root`) and the sidebar can show which one it
/// is. Upserts like `upsert_conversation` since this can be called before
/// the conversation's first message (right after a worktree is picked),
/// when no row exists yet.
pub fn set_conversation_worktree(
    db: &Db,
    conversation_id: &str,
    project_root: &str,
    worktree_path: Option<&str>,
) {
    let conn = db.0.lock().unwrap();
    let project_id = ensure_project_connection(&conn, project_root);
    let ts = now();
    let _ = conn.execute(
        "INSERT INTO conversations
         (id, project_root, project_id, worktree_path, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(id) DO UPDATE SET worktree_path = ?4",
        params![conversation_id, project_root, project_id, worktree_path, ts],
    );
}

/// Whether `conversation_id` already has a `conversations` row — used by
/// `commands::set_conversation_root` to avoid inserting a stray empty
/// conversation for a still-fresh thread defaulting to its primary checkout
/// (nothing worth persisting yet if the user never sends a message).
pub fn conversation_exists(db: &Db, conversation_id: &str) -> bool {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT 1 FROM conversations WHERE id = ?1",
        params![conversation_id],
        |_| Ok(()),
    )
    .is_ok()
}

/// Returns the persisted title for a conversation, if one has been assigned.
pub fn get_conversation_title(db: &Db, conversation_id: &str) -> Option<String> {
    let conn = db.0.lock().unwrap();
    let title: Option<String> = conn
        .query_row(
            "SELECT title FROM conversations WHERE id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    let title = title?;
    // Upgrade titles written by the earlier implementation, which stored
    // the entire first prompt verbatim.
    let first_prompt: Option<String> = conn
        .query_row(
            "SELECT content FROM messages WHERE conversation_id = ?1 AND role = 'user' ORDER BY id ASC LIMIT 1",
            params![conversation_id],
            |row| row.get(0),
        )
        .ok();
    if first_prompt
        .as_deref()
        .is_some_and(|prompt| prompt.trim() == title)
    {
        if let Some(derived) = first_prompt.and_then(|prompt| title_from_message(&prompt)) {
            if derived != title {
                let _ = conn.execute(
                    "UPDATE conversations SET title = ?1 WHERE id = ?2",
                    params![&derived, conversation_id],
                );
                return Some(derived);
            }
        }
    }
    Some(title)
}

/// Sets or clears a conversation title without changing its activity order.
pub fn set_conversation_title(db: &Db, conversation_id: &str, title: Option<&str>) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "UPDATE conversations SET title = ?1 WHERE id = ?2",
        params![title, conversation_id],
    );
}

/// Marks or unmarks a conversation as done — sidebar organization only,
/// doesn't change its activity order (see `set_conversation_title`, which
/// this mirrors).
pub fn set_conversation_done(db: &Db, conversation_id: &str, done: bool) {
    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "UPDATE conversations SET done = ?1 WHERE id = ?2",
        params![done, conversation_id],
    );
}

/// Wipes a conversation's transcript for the local "/clear" command (see
/// `chat::clear_conversation`) but keeps the conversation itself: its row
/// (done, worktree, backend/model/permission choice) stays, so it stays in
/// the sidebar and the next message simply continues it. Only its title is
/// reset, so the next message derives a fresh one. Everything
/// it owns (sub-agents) goes entirely, same as `delete_conversation`, and so
/// does its stored ACP session and rate-limit state — see
/// `wipe_conversation_and_sub_agents` for why the ACP session must go.
pub fn clear_conversation(db: &Db, conversation_id: &str) {
    let conn = db.0.lock().unwrap();
    for id in owned_tree(&conn, conversation_id) {
        wipe_rows(&conn, &id, id != conversation_id);
    }
    let _ = conn.execute(
        "UPDATE conversations SET title = NULL WHERE id = ?1",
        params![conversation_id],
    );
}

/// Deletes `conversation_id` and every conversation it owns, directly or
/// through further owners (`owner_conversation_id`) — otherwise a sub-agent
/// would be an orphaned row the Sub Agents sidebar still lists with no way
/// back to the conversation that spawned them. Only the owner tree is
/// followed: a branch's `parent_conversation_id` is provenance, and a
/// branch owns its own copied rows, so deleting the conversation it was
/// forked from leaves it intact.
///
/// Also drops any stored agent-native session id (see `acp_sessions.rs`) for
/// each — otherwise the next connection's `session/load` would resume the
/// same ACP session and the agent would still remember everything. Not
/// scoped by `launch_command` since a conversation may have switched agents
/// over its lifetime and all of them should be forgotten.
///
/// Shared by `delete_conversation` (removed from the sidebar for good) and
/// `sub_agents::delete_sub_agent`; `clear_conversation` walks the same tree
/// but keeps the root's own row.
pub(super) fn wipe_conversation_and_sub_agents(conn: &Connection, conversation_id: &str) {
    for id in owned_tree(conn, conversation_id) {
        wipe_rows(conn, &id, true);
    }
}

/// Every row keyed by one conversation id; `include_row` also drops the
/// `conversations` row itself.
fn wipe_rows(conn: &Connection, id: &str, include_row: bool) {
    for sql in [
        "DELETE FROM messages WHERE conversation_id = ?1",
        "DELETE FROM acp_agent_sessions WHERE conversation_id = ?1",
        "DELETE FROM rate_limit_resumes WHERE conversation_id = ?1",
    ] {
        let _ = conn.execute(sql, params![id]);
    }
    if include_row {
        let _ = conn.execute("DELETE FROM conversations WHERE id = ?1", params![id]);
    }
}

/// `conversation_id` plus everything it owns, transitively. `UNION` (not
/// `UNION ALL`) so a cycle in `owner_conversation_id` can't loop forever.
/// `record_sub_agent_started` writes `owner_conversation_id` directly (see
/// `db/sub_agents.rs`), so a sub-agent is already covered by this column —
/// no separate table to also join against.
fn owned_tree(conn: &Connection, conversation_id: &str) -> Vec<String> {
    let mut ids = conn
        .prepare(
            "WITH RECURSIVE tree(id) AS (
                 SELECT ?1
                 UNION
                 SELECT c.id FROM tree JOIN conversations c
                     ON c.owner_conversation_id = tree.id
             )
             SELECT id FROM tree",
        )
        .and_then(|mut stmt| {
            stmt.query_map(params![conversation_id], |row| row.get(0))?
                .collect::<rusqlite::Result<Vec<String>>>()
        })
        .unwrap_or_default();
    if ids.is_empty() {
        ids.push(conversation_id.to_string());
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat::ChatMessage;
    use crate::db::{load_messages, record_sub_agent_started, save_message};

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        Db::open(path)
    }

    #[test]
    fn clear_conversation_wipes_only_the_targeted_conversation() {
        let db = temp_db();
        save_message(
            &db,
            "/proj-a",
            "/proj-a",
            &ChatMessage {
                role: "user".into(),
                content: "in project a".into(),
                tool_calls: None,
            },
        );
        save_message(
            &db,
            "/proj-b",
            "/proj-b",
            &ChatMessage {
                role: "user".into(),
                content: "in project b".into(),
                tool_calls: None,
            },
        );

        clear_conversation(&db, "/proj-a");

        assert_eq!(load_messages(&db, "/proj-a").len(), 0);
        assert_eq!(load_messages(&db, "/proj-b").len(), 1);
    }

    #[test]
    fn clear_conversation_lets_a_fresh_message_start_a_new_conversation_row() {
        let db = temp_db();
        save_message(
            &db,
            "/proj",
            "/proj",
            &ChatMessage {
                role: "user".into(),
                content: "before clear".into(),
                tool_calls: None,
            },
        );
        clear_conversation(&db, "/proj");
        save_message(
            &db,
            "/proj",
            "/proj",
            &ChatMessage {
                role: "user".into(),
                content: "after clear".into(),
                tool_calls: None,
            },
        );

        let loaded = load_messages(&db, "/proj");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].content, "after clear");
    }

    #[test]
    fn clear_conversation_also_wipes_its_own_sub_agents_but_not_unrelated_ones() {
        let db = temp_db();
        record_sub_agent_started(&db, "sub-abc", "/proj", "count files", "llama3", None);
        save_message(
            &db,
            "sub-abc",
            "/proj",
            &ChatMessage {
                role: "user".into(),
                content: "sub-agent prompt".into(),
                tool_calls: None,
            },
        );
        record_sub_agent_started(&db, "sub-xyz", "/other", "unrelated task", "llama3", None);

        clear_conversation(&db, "/proj");

        assert!(crate::db::list_sub_agents_for_parent(&db, "/proj", 50).is_empty());
        assert!(load_messages(&db, "sub-abc").is_empty());
        assert_eq!(
            crate::db::list_sub_agents_for_parent(&db, "/other", 50).len(),
            1
        );
    }

    #[test]
    fn clear_conversation_drops_the_stored_acp_session_so_it_cannot_be_resumed() {
        use crate::db::{get_acp_agent_session_id, set_acp_agent_session_id, AgentSessionId};

        let db = temp_db();
        set_acp_agent_session_id(
            &db,
            "/proj",
            "claude-code",
            &AgentSessionId::new("agent-sess-1"),
        );
        set_acp_agent_session_id(
            &db,
            "/other",
            "claude-code",
            &AgentSessionId::new("agent-sess-2"),
        );

        clear_conversation(&db, "/proj");

        assert_eq!(get_acp_agent_session_id(&db, "/proj", "claude-code"), None);
        assert_eq!(
            get_acp_agent_session_id(&db, "/other", "claude-code"),
            Some(AgentSessionId::new("agent-sess-2"))
        );
    }

    #[test]
    fn list_all_conversations_excludes_sub_agents_and_sorts_by_recency() {
        let db = temp_db();
        save_message(
            &db,
            "/proj-a",
            "/proj-a",
            &ChatMessage {
                role: "user".into(),
                content: "first".into(),
                tool_calls: None,
            },
        );
        save_message(
            &db,
            "/proj-b",
            "/proj-b",
            &ChatMessage {
                role: "user".into(),
                content: "second".into(),
                tool_calls: None,
            },
        );
        // Both saves above land in the same wall-clock second (`now()` is
        // second-resolution) — pin distinct `updated_at` values directly so
        // the recency-sort assertion below isn't racing the clock.
        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "UPDATE conversations SET updated_at = 1 WHERE id = '/proj-a'",
                [],
            )
            .unwrap();
            conn.execute(
                "UPDATE conversations SET updated_at = 2 WHERE id = '/proj-b'",
                [],
            )
            .unwrap();
        }
        record_sub_agent_started(&db, "sub-abc", "/proj-a", "count files", "llama3", None);
        save_message(
            &db,
            "sub-abc",
            "/proj-a",
            &ChatMessage {
                role: "user".into(),
                content: "sub-agent prompt".into(),
                tool_calls: None,
            },
        );

        let all = list_all_conversations(&db);

        assert_eq!(all.len(), 2);
        assert!(all.iter().all(|c| c.id != "sub-abc"));
        assert_eq!(all[0].id, "/proj-b");
        assert_eq!(all[1].id, "/proj-a");
    }

    #[test]
    fn delete_conversation_removes_it_but_not_others() {
        let db = temp_db();
        save_message(
            &db,
            "/proj-a",
            "/proj-a",
            &ChatMessage {
                role: "user".into(),
                content: "in project a".into(),
                tool_calls: None,
            },
        );
        save_message(
            &db,
            "/proj-b",
            "/proj-b",
            &ChatMessage {
                role: "user".into(),
                content: "in project b".into(),
                tool_calls: None,
            },
        );

        delete_conversation(&db, "/proj-a");

        assert_eq!(load_messages(&db, "/proj-a").len(), 0);
        assert_eq!(load_messages(&db, "/proj-b").len(), 1);
        assert_eq!(
            list_all_conversations(&db)
                .iter()
                .map(|c| c.id.clone())
                .collect::<Vec<_>>(),
            vec!["/proj-b".to_string()]
        );
    }

    #[test]
    fn delete_conversation_also_wipes_its_own_sub_agents_but_not_unrelated_ones() {
        let db = temp_db();
        record_sub_agent_started(&db, "sub-abc", "/proj", "count files", "llama3", None);
        save_message(
            &db,
            "sub-abc",
            "/proj",
            &ChatMessage {
                role: "user".into(),
                content: "sub-agent prompt".into(),
                tool_calls: None,
            },
        );
        record_sub_agent_started(&db, "sub-xyz", "/other", "unrelated task", "llama3", None);

        delete_conversation(&db, "/proj");

        assert!(crate::db::list_sub_agents_for_parent(&db, "/proj", 50).is_empty());
        assert!(load_messages(&db, "sub-abc").is_empty());
        assert_eq!(
            crate::db::list_sub_agents_for_parent(&db, "/other", 50).len(),
            1
        );
    }
    fn user_message(text: &str) -> ChatMessage {
        ChatMessage {
            role: "user".into(),
            content: text.into(),
            tool_calls: None,
        }
    }

    fn set_owner(db: &Db, id: &str, owner: &str) {
        db.0.lock()
            .unwrap()
            .execute(
                "UPDATE conversations SET owner_conversation_id = ?2 WHERE id = ?1",
                params![id, owner],
            )
            .unwrap();
    }

    #[test]
    fn delete_conversation_follows_ownership_through_any_depth() {
        let db = temp_db();
        for id in ["top", "child", "grandchild", "unrelated"] {
            save_message(&db, id, "/proj", &user_message(id));
        }
        set_owner(&db, "child", "top");
        set_owner(&db, "grandchild", "child");

        delete_conversation(&db, "top");

        for id in ["top", "child", "grandchild"] {
            assert!(!conversation_exists(&db, id), "{id} should be gone");
            assert!(load_messages(&db, id).is_empty());
        }
        assert!(conversation_exists(&db, "unrelated"));
    }

    #[test]
    fn deleting_a_conversation_leaves_the_branches_forked_from_it() {
        let db = temp_db();
        save_message(&db, "original", "/proj", &user_message("hello"));
        save_message(&db, "fork", "/proj", &user_message("hello"));
        db.0.lock()
            .unwrap()
            .execute(
                "UPDATE conversations SET parent_conversation_id = 'original',
                 branch_point_message_id = 1 WHERE id = 'fork'",
                [],
            )
            .unwrap();

        delete_conversation(&db, "original");

        assert!(conversation_exists(&db, "fork"));
        assert_eq!(load_messages(&db, "fork").len(), 1);
    }

    #[test]
    fn an_ownership_cycle_does_not_hang_delete() {
        let db = temp_db();
        for id in ["a", "b"] {
            save_message(&db, id, "/proj", &user_message(id));
        }
        set_owner(&db, "a", "b");
        set_owner(&db, "b", "a");

        delete_conversation(&db, "a");

        assert!(!conversation_exists(&db, "a"));
        assert!(!conversation_exists(&db, "b"));
    }

    #[test]
    fn a_sub_agent_row_exists_before_its_first_message_and_stays_hidden_after() {
        let db = temp_db();
        save_message(&db, "parent", "/proj", &user_message("hi"));
        record_sub_agent_started(&db, "sub", "parent", "d", "m", None);
        assert!(conversation_exists(&db, "sub"));
        save_message(&db, "sub", "/proj", &user_message("p"));

        let visible: Vec<_> = list_all_conversations(&db)
            .into_iter()
            .map(|c| c.id)
            .collect();
        assert_eq!(visible, vec!["parent".to_string()]);
    }

    #[test]
    fn agent_names_are_unique_per_owner_only() {
        let db = temp_db();
        for id in ["o1", "o2", "a", "b", "c"] {
            save_message(&db, id, "/proj", &user_message(id));
        }
        let conn = db.0.lock().unwrap();
        let name = |id: &str, owner: &str| {
            conn.execute(
                "UPDATE conversations SET owner_conversation_id = ?2, name = 'reviewer' WHERE id = ?1",
                params![id, owner],
            )
        };
        assert!(name("a", "o1").is_ok());
        assert!(name("b", "o2").is_ok());
        assert!(name("c", "o1").is_err());
    }

    #[test]
    fn set_conversation_backend_upserts_before_the_first_message() {
        let db = temp_db();

        set_conversation_backend(
            &db,
            "new",
            "/proj",
            "{\"kind\":\"acp\"}",
            Some("m"),
            Some("e"),
        );
        assert!(conversation_exists(&db, "new"));
        let row = list_all_conversations(&db).into_iter().next().unwrap();
        assert_eq!(row.backend.as_deref(), Some("{\"kind\":\"acp\"}"));
        assert_eq!(row.model.as_deref(), Some("m"));
        assert_eq!(row.effort.as_deref(), Some("e"));

        // The conversation's first real message upserts the same row
        // (`messages::save_message`) and must not clobber what was already
        // chosen for it.
        save_message(&db, "new", "/proj", &user_message("hello"));
        assert_eq!(load_messages(&db, "new").len(), 1);
        let row = list_all_conversations(&db).into_iter().next().unwrap();
        assert_eq!(row.backend.as_deref(), Some("{\"kind\":\"acp\"}"));

        set_conversation_backend(&db, "new", "/proj", "{\"kind\":\"builtin\"}", None, None);
        let row = list_all_conversations(&db).into_iter().next().unwrap();
        assert_eq!(row.backend.as_deref(), Some("{\"kind\":\"builtin\"}"));
        assert_eq!(row.model, None);
    }

    #[test]
    fn set_conversation_permission_mode_upserts_independently_of_backend() {
        let db = temp_db();

        set_conversation_permission_mode(&db, "c1", "/proj", "bypass");
        let row = list_all_conversations(&db).into_iter().next().unwrap();
        assert_eq!(row.permission_mode.as_deref(), Some("bypass"));
        assert_eq!(row.backend, None);

        set_conversation_backend(&db, "c1", "/proj", "{\"kind\":\"acp\"}", None, None);
        let row = list_all_conversations(&db).into_iter().next().unwrap();
        assert_eq!(row.permission_mode.as_deref(), Some("bypass"));
        assert_eq!(row.backend.as_deref(), Some("{\"kind\":\"acp\"}"));
    }

    #[test]
    fn clear_conversation_keeps_the_conversation_row_and_its_settings() {
        let db = temp_db();
        save_message(&db, "c1", "/proj", &user_message("hello"));
        set_conversation_title(&db, "c1", Some("My chat"));
        set_conversation_backend(&db, "c1", "/proj", "{\"kind\":\"acp\"}", Some("m"), None);
        record_sub_agent_started(&db, "sub", "c1", "d", "m", None);

        clear_conversation(&db, "c1");

        assert!(load_messages(&db, "c1").is_empty());
        assert!(!conversation_exists(&db, "sub"));
        let row = list_all_conversations(&db)
            .into_iter()
            .find(|c| c.id == "c1")
            .expect("cleared conversation stays listed");
        assert_eq!(row.title, None, "the next message derives a new title");
        assert_eq!(row.model.as_deref(), Some("m"));
    }
}
