mod agent_loop;
pub(crate) mod history;
mod sub_agents;

use crate::backend::{self, Backend, NativeBackend};
use crate::db;
use crate::provider::ProviderConfig;
use crate::state::AppState;
use crate::tools::ToolCall;
use history::{emit_conversation_changed, load_conversation_history};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

// `pub(crate)`, not `pub use`: `tools/shell_tools.rs`, `tools/sub_agent_tools.rs`,
// and `acp/events.rs`/`acp/process.rs` reference these by their
// `crate::chat::*` path directly, same reasoning as the
// `tools::permissions`/`tools::shell_tools` re-exports in `tools/mod.rs` — a
// plain re-export is enough here since nothing needs to name these through
// `generate_handler!`.
pub(crate) use agent_loop::{push_message, remember_in_memory, start_streaming_message};
pub(crate) use sub_agents::{record_sub_agent_result, run_sub_agent};

#[derive(Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

pub struct TurnResult {
    pub content: String,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub prompt_tokens: Option<u64>,
    pub completion_tokens: Option<u64>,
}

#[tauri::command]
pub fn cancel_prompt(state: State<AppState>, session_id: String) -> Result<(), String> {
    backend::cancel(state.inner(), &session_id);
    Ok(())
}

/// Signals cancellation like `cancel_prompt`, then actually waits for any
/// turn currently running for `session_id` to stop before returning — i.e.
/// for `run_with_cancellation`'s per-session lock (`state.session_locks`) to
/// be released, which only happens once the turn's loop observes the flag
/// (or finishes on its own) and returns. A no-op, near-instant wait when
/// nothing is running for this session (the lock is either absent or
/// uncontended).
///
/// Used by `history::delete_conversation` so a still-running turn's
/// `push_message`/`save_message` calls can never land *after* the
/// conversation's rows are gone — without this, `upsert_conversation`'s
/// `INSERT ... ON CONFLICT DO UPDATE` would silently resurrect the row a
/// moment after it was deleted.
pub(crate) async fn cancel_and_await_idle(state: &AppState, session_id: &str) {
    backend::cancel(state, session_id);
    let lock = state.session_locks.lock().unwrap().get(session_id).cloned();
    if let Some(lock) = lock {
        let _guard = lock.lock().await;
    }
}

/// The local "/clear" command — see `ChatPanel.tsx`'s `LOCAL_COMMANDS`. No
/// ACP agent implements a matching request (the protocol doesn't define
/// one), so this is entirely our own bookkeeping, not anything sent over
/// the wire: wipes the on-disk and in-memory transcript for `session_id`
/// *and* every sub-agent it spawned (sub-agents are scoped to whichever
/// conversation spawned them, so clearing/deleting one takes its sub-agents
/// with it — see `db::clear_conversation`'s doc comment), and — if an ACP
/// subprocess is currently attached to any of them — drops our handle to it
/// too. That subprocess isn't killed outright (a turn could still be in
/// flight); it just winds down on its own once idle, the same as switching
/// to a different agent does (see `ensure_acp_session`'s doc comment) — the
/// *next* prompt for this session then starts a genuinely fresh
/// `session/new` instead of continuing a conversation the agent still
/// remembers everything about, since ACP has no session/truncate. That
/// guarantee depends on `db::clear_conversation` also dropping this
/// conversation's `acp_agent_sessions` row — without it, the stored
/// agent-native session id would survive the clear and the next connection
/// would `session/load` straight back into the same agent-side context.
/// The frontend only calls this while nothing is generating (mirroring
/// `retry_last`), so there's no live turn whose `push_message` calls could
/// otherwise land in the freshly-cleared history right after this runs.
#[tauri::command]
pub fn clear_conversation(
    app: AppHandle,
    state: State<AppState>,
    session_id: String,
) -> Result<(), String> {
    // Sub-agent ids must be read *before* the DB wipe below deletes their
    // conversation rows — there'd be nothing left to query afterward.
    let sub_agent_ids: Vec<String> =
        db::list_sub_agents_for_parent(&state.db, &session_id, usize::MAX)
            .into_iter()
            .map(|s| s.id)
            .collect();
    for id in std::iter::once(session_id.clone()).chain(sub_agent_ids) {
        backend::close(state.inner(), &id, false);
    }
    db::clear_conversation(&state.db, &session_id);
    // The row itself stays (see `db::clear_conversation`), but its sub-agents
    // and activity don't — let the sidebar refresh.
    emit_conversation_changed(&app, &session_id, "cleared");
    Ok(())
}

/// The local "/compact" command — see `ChatPanel.tsx`'s `LOCAL_COMMANDS`.
/// Only ever called for the built-in provider loop: unlike `/clear`, the
/// frontend doesn't offer this at all in ACP mode, since an ACP agent's
/// real context lives inside its own subprocess (nothing to compact from
/// out here) and some agents implement a genuine `/compact` of their own
/// that intercepting the name locally would otherwise shadow.
///
/// Asks the model itself for a summary of the existing transcript — a
/// plain one-shot completion (`ModelClient::complete`, no tools, no
/// streaming) — then wipes the on-disk/in-memory history exactly like
/// `clear_conversation` does and reseeds it with a single synthetic `user`
/// message carrying that summary, so the *next* real turn still has it as
/// context. (`user`, not `assistant`, because it's not something the model
/// actually said — but the frontend renders it as a distinct info banner
/// rather than a normal chat bubble either way; see `runLocalCommand`.)
/// Returns the summary text directly so the frontend can show it without a
/// second round-trip through `load_conversation_history`.
#[tauri::command]
pub async fn compact_conversation(
    state: State<'_, AppState>,
    session_id: String,
    provider: ProviderConfig,
    model: String,
) -> Result<String, String> {
    let history = load_conversation_history(state.clone(), session_id.clone())?;
    if history.is_empty() {
        return Err("Nothing to compact yet.".to_string());
    }

    let mut prompt_history: Vec<ChatMessage> = history
        .into_iter()
        .map(|m| ChatMessage {
            role: m.role,
            content: m.content,
            tool_calls: m.tool_calls,
        })
        .collect();
    prompt_history.push(ChatMessage {
        role: "user".into(),
        content: "Summarize this conversation so far in a concise paragraph that preserves \
                  important context, decisions, and any unresolved tasks, so it can be used as \
                  the starting context for continuing it. Write only the summary itself, no \
                  preamble or heading."
            .into(),
        tool_calls: None,
    });

    let summary = provider
        .client()
        .complete(&model, &prompt_history)
        .await
        .map_err(|e| e.message().to_string())?;

    state.chat_sessions.lock().unwrap().remove(&session_id);
    state.touched_dirs.lock().unwrap().remove(&session_id);
    db::clear_conversation(&state.db, &session_id);
    push_message(
        &state,
        &session_id,
        ChatMessage {
            role: "user".into(),
            content: format!("[Earlier conversation compacted to save context]\n\n{summary}"),
            tool_calls: None,
        },
    );

    Ok(summary)
}

/// One turn of the native agent loop on a top-level conversation, holding
/// its per-session lock — shared by a typed message, a retry and a
/// finished sub-agent's result (`autonomous`).
pub(crate) async fn run_turn(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    native: &NativeBackend,
    autonomous: bool,
) -> Result<(), String> {
    agent_loop::run_with_cancellation(app, state, session_id, session_id, native, true, autonomous)
        .await
}

#[tauri::command]
pub async fn send_prompt(
    app: tauri::AppHandle,
    session_id: String,
    provider: ProviderConfig,
    model: String,
    message: String,
) -> Result<(), String> {
    NativeBackend {
        provider,
        model,
        effort: None,
    }
    .send(&app, &session_id, message)
    .await
}

/// Drops trailing assistant/tool messages back to the last user message, then
/// re-runs generation on the existing history. Used for both "regenerate this
/// response" (last message is assistant/tool) and "retry this message" (last
/// message is already the user's, e.g. a previous attempt errored before any
/// reply came back) — in both cases the effect is "answer the last user
/// message again from scratch".
#[tauri::command]
pub async fn retry_last(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    provider: ProviderConfig,
    model: String,
) -> Result<(), String> {
    {
        let mut sessions = state.chat_sessions.lock().unwrap();
        if let Some(history) = sessions.get_mut(&session_id) {
            while matches!(history.last(), Some(m) if m.role != "user") {
                history.pop();
            }
        }
    }

    let native = NativeBackend {
        provider,
        model,
        effort: None,
    };
    run_turn(&app, &state, &session_id, &native, false).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use std::collections::{HashMap, HashSet};
    use std::sync::atomic::AtomicBool;
    use std::sync::{Arc, Mutex};
    use tokio::sync::Mutex as AsyncMutex;

    fn temp_db() -> Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4()));
        Db::open(path)
    }

    // Built field-by-field rather than `AppState::default()` — `Db`'s
    // `Default` impl opens the *real* app config-dir database, which a test
    // must never touch.
    fn test_state() -> AppState {
        AppState {
            project_root: Mutex::new(None),
            conversation_roots: Mutex::new(HashMap::new()),
            sub_agent_parents: Mutex::new(HashMap::new()),
            ptys: Mutex::new(HashMap::new()),
            chat_sessions: Mutex::new(HashMap::new()),
            pending_permissions: Mutex::new(HashMap::new()),
            pending_elicitations: Mutex::new(HashMap::new()),
            cancellations: Mutex::new(HashMap::new()),
            touched_dirs: Mutex::new(HashMap::new()),
            session_locks: Mutex::new(HashMap::new()),
            fs_watcher: Mutex::new(None),
            git_watchers: Mutex::new(HashMap::new()),
            db: temp_db(),
            acp_sessions: Mutex::new(HashMap::new()),
            rate_limit_timers: Mutex::new(HashMap::new()),
            preferences: Mutex::new(Default::default()),
            acp_agent_catalog: Mutex::new(Vec::new()),
            acp_catalog_refresh_started: AtomicBool::new(false),
            mcp_bridge: Mutex::new(None),
            permission_bypass: Mutex::new(HashSet::new()),
            runs: Default::default(),
        }
    }

    #[test]
    fn top_level_session_id_resolves_a_registered_sub_agent_to_its_parent() {
        let state = test_state();
        state
            .sub_agent_parents
            .lock()
            .unwrap()
            .insert("sub-1".into(), "conv-1".into());

        assert_eq!(
            crate::commands::top_level_session_id(&state, "sub-1"),
            "conv-1"
        );
        assert_eq!(
            crate::commands::top_level_session_id(&state, "conv-1"),
            "conv-1"
        );
        // Ids are opaque — a lookalike that was never registered is its own root.
        assert_eq!(
            crate::commands::top_level_session_id(&state, "conv-1::spawn_sub_agent::x"),
            "conv-1::spawn_sub_agent::x"
        );
    }

    #[test]
    fn cancel_sets_the_flag_for_a_known_session() {
        let state = test_state();
        let flag = Arc::new(AtomicBool::new(false));
        state
            .cancellations
            .lock()
            .unwrap()
            .insert("sess".to_string(), flag.clone());

        backend::cancel(&state, "sess");

        assert!(flag.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[tokio::test]
    async fn cancel_and_await_idle_returns_immediately_when_nothing_is_running() {
        let state = test_state();
        // No entry in `session_locks` for this id at all — must not hang.
        cancel_and_await_idle(&state, "sess").await;
    }

    #[tokio::test]
    async fn cancel_and_await_idle_waits_for_an_in_flight_turn_to_release_its_lock() {
        let state = test_state();
        let lock = Arc::new(AsyncMutex::new(()));
        state
            .session_locks
            .lock()
            .unwrap()
            .insert("sess".to_string(), lock.clone());

        // Simulate `run_with_cancellation` holding the session lock for the
        // duration of an in-flight turn.
        let guard = lock.clone().lock_owned().await;
        let released = Arc::new(AtomicBool::new(false));
        let released_writer = released.clone();
        let turn = tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(30)).await;
            released_writer.store(true, std::sync::atomic::Ordering::SeqCst);
            drop(guard);
        });

        cancel_and_await_idle(&state, "sess").await;

        assert!(
            released.load(std::sync::atomic::Ordering::SeqCst),
            "must not return before the in-flight turn actually released the lock"
        );
        turn.await.unwrap();
    }
}
