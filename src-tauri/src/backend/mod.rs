//! The `Backend` trait: whoever answers a conversation — a native provider
//! driven by our own agent loop (`NativeBackend`) or an external ACP agent
//! that runs its own (`crate::acp::AcpBackend`). Sending a message, running a
//! sub-agent's task and handing a finished sub-agent's result back all go
//! through it, so `chat/`, `tools/` and `mcp_bridge` never branch on which
//! kind they're talking to. The frontend counterpart is `ChatBackend`
//! (`src/features/chat/chatBackend.ts`).
//!
//! Methods return boxed futures rather than using `async fn`: the trait is
//! used as `dyn Backend`, and `async fn` in traits isn't object-safe. The
//! explicit future type also breaks the type-inference cycle between the
//! native agent loop, `execute_tool` and `spawn_sub_agent`.

mod native;
pub mod registry;
mod secrets;
pub mod session;

pub use native::NativeBackend;

use crate::state::AppState;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::AppHandle;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// What a backend supports, so callers ask instead of checking its kind.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Capabilities {
    /// Its models can be listed; otherwise the model id is free text.
    pub model_listing: bool,
    /// Runs its own agent loop (tools, history) rather than ours — ACP.
    pub owns_agent_loop: bool,
    /// Accepts our tool definitions and returns tool calls.
    pub native_tools: bool,
    /// Streams reasoning separately from the answer.
    pub thinking: bool,
    /// Picks up a previous session's context on reconnect.
    pub resume: bool,
    /// Honors a reasoning-effort setting.
    pub effort: bool,
    /// Can run `/compact`'s summarization call.
    pub compaction: bool,
    /// Can answer the last message again (`retry`).
    pub retry: bool,
    /// Advertises its own slash commands.
    pub slash_commands: bool,
}

pub trait Backend: Send + Sync {
    fn capabilities(&self) -> Capabilities;

    /// The native provider and model this conversation's sub-agents run on
    /// when `spawn_sub_agent` names no ACP agent. For an ACP backend that's
    /// the one the frontend sent along with the agent (until the backend
    /// registry replaces it — PLAN.md, Phase 5 step 3).
    fn native(&self) -> &NativeBackend;

    /// Gets ready ahead of the first message (an ACP agent's subprocess
    /// connects), so a failure shows before there's typed text to strand.
    /// Nothing to do for a backend that keeps no connection.
    fn warm(&self, _app: &AppHandle, _session_id: &str) {}

    /// Runs the user's `message` on `session_id`. Resolves once the turn has
    /// finished (native) or been handed to the agent (ACP) — either way its
    /// output streams on `chat://{session_id}/...`.
    fn send<'a>(
        &'a self,
        app: &'a AppHandle,
        session_id: &'a str,
        message: String,
    ) -> BoxFuture<'a, Result<(), String>>;

    /// Takes a turn on what's already been added to `session_id`'s history —
    /// a message another agent's chat sent it (`board::messaging`), which
    /// that code persisted itself. Nobody typed it, so it's `autonomous`.
    /// `prompt` is that message as the agent should get it: an ACP agent
    /// keeps its own history, so it's sent there as a prompt; our own loop
    /// already has it in history.
    fn continue_turn<'a>(
        &'a self,
        app: &'a AppHandle,
        session_id: &'a str,
        prompt: String,
    ) -> BoxFuture<'a, Result<(), String>>;

    /// Runs a sub-agent's one task under its own `sub_session_id` and
    /// resolves to its final text. `cancel_flag` is the sub-agent's Stop.
    fn run_task<'a>(
        &'a self,
        app: &'a AppHandle,
        parent_session_id: &'a str,
        sub_session_id: &'a str,
        prompt: &'a str,
        cancel_flag: &'a Arc<AtomicBool>,
    ) -> BoxFuture<'a, Result<String, String>>;

    /// Answers the last user message again from scratch. Only when
    /// `capabilities().retry` — an ACP agent keeps its own history.
    fn retry<'a>(
        &'a self,
        _app: &'a AppHandle,
        _session_id: &'a str,
    ) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async { Err("This agent can't retry a turn.".to_string()) })
    }

    /// Summarizes `session_id`'s transcript and replaces it with the summary,
    /// resolving to the summary. Only when `capabilities().compaction`.
    fn compact<'a>(
        &'a self,
        _app: &'a AppHandle,
        _session_id: &'a str,
    ) -> BoxFuture<'a, Result<String, String>> {
        Box::pin(async { Err("This agent can't compact a conversation.".to_string()) })
    }

    /// A sub-agent `session_id` spawned has finished: records its result in
    /// `session_id`'s transcript and lets this backend react to it with a
    /// new turn nobody typed.
    fn deliver_task_result<'a>(
        &'a self,
        app: &'a AppHandle,
        session_id: &'a str,
        result: TaskResult,
    ) -> BoxFuture<'a, ()>;
}

/// A finished sub-agent, as its parent hears about it.
pub struct TaskResult {
    pub sub_session_id: String,
    pub description: String,
    pub result: String,
}

/// Stops whatever is running on `session_id` — the native loop's
/// cancellation flag and, if an ACP agent is attached, its in-flight
/// prompt. Purely a signal: doesn't wait for the turn to notice; see
/// `chat::cancel_and_await_idle` for that.
pub fn cancel(state: &AppState, session_id: &str) {
    if let Some(flag) = state.cancellations.lock().unwrap().get(session_id) {
        flag.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    crate::acp::cancel(state, session_id);
}

/// Drops `session_id`'s live connection, if its backend keeps one (an ACP
/// subprocess), without touching its history. The subprocess isn't killed
/// outright — a turn could still be in flight — it winds down once idle,
/// and the next message starts a fresh connection.
pub fn disconnect(state: &AppState, session_id: &str) {
    state.acp_sessions.lock().unwrap().remove(session_id);
}

/// Forgets everything held in memory for `session_id` — its connection and
/// the history/scoping state that isn't itself in SQLite, so a DB wipe
/// alone doesn't reset it. `forget_permission_mode` is `false` for
/// "/clear" (the id is reused and keeps its Ask/Bypass choice) and `true`
/// for a deleted conversation.
pub fn close(state: &AppState, session_id: &str, forget_permission_mode: bool) {
    disconnect(state, session_id);
    state.chat_sessions.lock().unwrap().remove(session_id);
    state.touched_dirs.lock().unwrap().remove(session_id);
    crate::acp::rate_limit::cancel_timer(state, session_id);
    if forget_permission_mode {
        state.permission_bypass.lock().unwrap().remove(session_id);
    }
}
