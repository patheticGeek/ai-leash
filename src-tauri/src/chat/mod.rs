mod agent_loop;
pub(crate) mod history;
mod sub_agents;

use crate::db;
use crate::provider::{self, ProviderConfig};
use crate::state::AppState;
use crate::tools::ToolCall;
use history::load_conversation_history;
use serde::{Deserialize, Serialize};
use tauri::State;

// `pub(crate)`, not `pub use`: `tools/shell_tools.rs`, `tools/sub_agent_tools.rs`,
// and `acp/events.rs`/`acp/process.rs` reference these by their
// `crate::chat::*` path directly, same reasoning as the
// `tools::permissions`/`tools::shell_tools` re-exports in `tools/mod.rs` — a
// plain re-export is enough here since nothing needs to name these through
// `generate_handler!`.
pub(crate) use agent_loop::{push_message, remember_in_memory, start_streaming_message};
pub(crate) use sub_agents::{resume_after_background_subtask, run_sub_agent};

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
    if let Some(flag) = state.cancellations.lock().unwrap().get(&session_id) {
        flag.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    if let Some(session) = state.acp_sessions.lock().unwrap().get(&session_id) {
        let _ = session.sender.send(crate::acp::AcpCommand::Cancel);
    }
    Ok(())
}

/// The local "/clear" command — see `ChatPanel.tsx`'s `LOCAL_COMMANDS`. No
/// ACP agent implements a matching request (the protocol doesn't define
/// one), so this is entirely our own bookkeeping, not anything sent over
/// the wire: wipes the on-disk and in-memory transcript for `session_id`,
/// and — if an ACP subprocess is currently attached — drops our handle to
/// it too. That subprocess isn't killed outright (a turn could still be
/// in flight); it just winds down on its own once idle, the same as
/// switching to a different agent does (see `ensure_acp_session`'s doc
/// comment) — the *next* prompt for this session then starts a genuinely
/// fresh `session/new` instead of continuing a conversation the agent
/// still remembers everything about, since ACP has no session/truncate.
/// That guarantee depends on `db::clear_conversation` also dropping this
/// conversation's `acp_agent_sessions` row — without it, the stored
/// agent-native session id would survive the clear and the next connection
/// would `session/load` straight back into the same agent-side context.
/// The frontend only calls this while nothing is generating (mirroring
/// `retry_last`), so there's no live turn whose `push_message` calls could
/// otherwise land in the freshly-cleared history right after this runs.
#[tauri::command]
pub fn clear_conversation(state: State<AppState>, session_id: String) -> Result<(), String> {
    state.chat_sessions.lock().unwrap().remove(&session_id);
    state.touched_dirs.lock().unwrap().remove(&session_id);
    state.acp_sessions.lock().unwrap().remove(&session_id);
    db::clear_conversation(&state.db, &session_id);
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
/// plain one-shot completion (`provider::complete`, no tools, no
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

    let summary = provider::complete(&provider, &model, &prompt_history).await?;

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

#[tauri::command]
pub async fn send_prompt(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    provider: ProviderConfig,
    model: String,
    message: String,
) -> Result<(), String> {
    push_message(
        &state,
        &session_id,
        ChatMessage {
            role: "user".into(),
            content: message,
            tool_calls: None,
        },
    );

    agent_loop::run_with_cancellation(
        &app,
        &state,
        &session_id,
        &session_id,
        &provider,
        &model,
        true,
        false,
    )
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

    agent_loop::run_with_cancellation(
        &app,
        &state,
        &session_id,
        &session_id,
        &provider,
        &model,
        true,
        false,
    )
    .await
}
