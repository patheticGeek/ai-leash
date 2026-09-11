use super::discovery::available_commands_payload;
use crate::chat::{self, ChatMessage};
use crate::db;
use crate::state::AppState;
use crate::tools;
use agent_client_protocol::schema::v1::{
    ContentBlock, SessionUpdate, ToolCall, ToolCallContent, ToolCallStatus, ToolCallUpdate,
};
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use tauri::{AppHandle, Emitter, Manager};

/// Per-connection state tracking each in-flight ACP tool call's most
/// recently seen `content`, keyed by tool-call id. `ToolCallUpdateFields`
/// replaces the content collection rather than extending it (per the ACP
/// spec), but that replacement is per-*message* — a later update that only
/// changes `status` to terminal, without re-including `content`, must still
/// see whatever an earlier update last set, not empty. Entries are removed
/// once a call reaches a terminal state.
pub(super) type PendingToolCallContent = Arc<StdMutex<HashMap<String, Vec<ToolCallContent>>>>;

/// Which kind of streamed run a `TurnSegment` is — either the agent's reply
/// or its reasoning. Kept as its own type (rather than a bare `&str`) so a
/// role switch can be detected with `==` and mapped to the right persisted
/// role (and skip the chat-session bookkeeping — see `close_segment_locked`)
/// without stringly-typed comparisons scattered around.
#[derive(PartialEq, Eq, Clone, Copy)]
enum SegmentRole {
    Assistant,
    Thinking,
}

impl SegmentRole {
    fn as_db_role(self) -> &'static str {
        match self {
            Self::Assistant => "assistant",
            Self::Thinking => "thinking",
        }
    }
}

/// One contiguous run of same-kind streamed text within a single ACP turn —
/// the agent's reply or its reasoning. A turn can freely alternate between
/// reply text, thinking, and tool calls any number of times before it
/// resolves, so each run gets its own DB row (via `message_id`, lazily
/// reserved on the run's first chunk) rather than one row per turn: if every
/// run in a turn shared one row, a run that starts *after* a tool call would
/// still land in a row created *before* it, keeping that row's original
/// (now stale) position when the conversation is reloaded — the mid-turn
/// text would render ahead of the tool call it actually followed. Closed out
/// (see `close_segment_locked`) whenever the next chunk is a different role,
/// a tool call arrives, or the turn ends.
pub(super) struct TurnSegment {
    role: SegmentRole,
    message_id: Option<i64>,
    buffer: String,
}

/// The run currently being streamed into, if any — `None` between runs (a
/// fresh connection, right after a tool call, or right after
/// `AcpCommand::Prompt` resets it for a new turn — see `process.rs`).
pub(super) type CurrentSegment = Arc<StdMutex<Option<TurnSegment>>>;

/// Closes out whatever run is open on an already-locked slot, leaving it
/// empty. The DB side needs no action — every chunk already flushed the
/// run's content live via `update_streaming_message` — this only mirrors a
/// finished *assistant* run into `chat_sessions` (`remember_in_memory`), the
/// same in-memory bookkeeping `push_message` gives tool calls and results.
/// Thinking runs are never mirrored there: `chat_sessions` is also what a
/// conversation's *built-in*-provider turns get sent as literal API message
/// history if this same session later switches off ACP, and `"thinking"` is
/// not a role either provider's chat API understands.
fn close_segment_locked(app: &AppHandle, session_id: &str, slot: &mut Option<TurnSegment>) {
    let Some(seg) = slot.take() else { return };
    if seg.buffer.is_empty() || seg.role != SegmentRole::Assistant {
        return;
    }
    let state = app.state::<AppState>();
    let message = ChatMessage {
        role: "assistant".into(),
        content: seg.buffer,
        tool_calls: None,
    };
    match seg.message_id {
        Some(_) => chat::remember_in_memory(&state, session_id, message),
        None => chat::push_message(&state, session_id, message),
    }
}

/// Closes out whatever run is currently open — see `close_segment_locked`.
/// Called at the end of a whole ACP turn (`process.rs`), once the agent's
/// `PromptRequest` has resolved and nothing further will extend it.
pub(super) fn close_segment(app: &AppHandle, session_id: &str, current: &CurrentSegment) {
    close_segment_locked(app, session_id, &mut current.lock().unwrap());
}

/// Appends one chunk of text to the currently open run of `role`, starting a
/// fresh run first if none is open or the open one is the other role —
/// closing that one out in the process so its bookkeeping isn't lost (see
/// `close_segment_locked`).
fn push_segment_chunk(
    app: &AppHandle,
    session_id: &str,
    current: &CurrentSegment,
    role: SegmentRole,
    text: &str,
) {
    let mut slot = current.lock().unwrap();
    if !matches!(slot.as_ref(), Some(seg) if seg.role == role) {
        close_segment_locked(app, session_id, &mut slot);
        let state = app.state::<AppState>();
        let message_id = chat::start_streaming_message(&state, session_id, role.as_db_role());
        *slot = Some(TurnSegment {
            role,
            message_id,
            buffer: String::new(),
        });
    }
    let seg = slot.as_mut().expect("just inserted above if absent");
    seg.buffer.push_str(text);
    if let Some(id) = seg.message_id {
        let state = app.state::<AppState>();
        db::update_streaming_message(&state.db, id, &seg.buffer);
    }
}

/// Set for the duration of a `session/load` call — the agent replays a
/// resumed session's whole history back as ordinary notifications before
/// that request resolves, and our SQLite transcript already has that
/// history (that's the entire premise of resuming), so replaying it through
/// `handle_session_notification` would just duplicate every past message on
/// each reconnect. See `process.rs`'s use of this around its
/// `LoadSessionRequest` call.
pub(super) type SuppressReplay = Arc<AtomicBool>;

pub(super) fn handle_session_notification(
    app: &AppHandle,
    session_id: &str,
    current_segment: &CurrentSegment,
    pending_tool_content: &PendingToolCallContent,
    suppress_replay: &SuppressReplay,
    update: SessionUpdate,
) {
    if suppress_replay.load(Ordering::Acquire) {
        return;
    }
    match update {
        SessionUpdate::AgentMessageChunk(chunk) => {
            if let ContentBlock::Text(text) = chunk.content {
                let _ = app.emit(&format!("chat://{session_id}/chunk"), &text.text);
                push_segment_chunk(
                    app,
                    session_id,
                    current_segment,
                    SegmentRole::Assistant,
                    &text.text,
                );
            }
        }
        SessionUpdate::AgentThoughtChunk(chunk) => {
            if let ContentBlock::Text(text) = chunk.content {
                let _ = app.emit(&format!("chat://{session_id}/thinking"), &text.text);
                push_segment_chunk(
                    app,
                    session_id,
                    current_segment,
                    SegmentRole::Thinking,
                    &text.text,
                );
            }
        }
        SessionUpdate::ToolCall(tool_call) => {
            close_segment(app, session_id, current_segment);
            emit_tool_call(app, session_id, &tool_call, pending_tool_content)
        }
        SessionUpdate::ToolCallUpdate(update) => {
            emit_tool_call_update(app, session_id, &update, pending_tool_content)
        }
        SessionUpdate::AvailableCommandsUpdate(update) => {
            let _ = app.emit(
                &format!("chat://{session_id}/acp_commands"),
                available_commands_payload(&update.available_commands),
            );
        }
        // UserMessageChunk is just an echo of what we already persisted
        // before sending the prompt; Plan/CurrentModeUpdate/ConfigOptionUpdate/
        // SessionInfoUpdate/UsageUpdate and anything else are out of scope
        // for this phase.
        _ => {}
    }
}

fn emit_tool_call(
    app: &AppHandle,
    session_id: &str,
    tool_call: &ToolCall,
    pending_tool_content: &PendingToolCallContent,
) {
    let call_id = tool_call.tool_call_id.to_string();
    let _ = app.emit(
        &format!("chat://{session_id}/tool_call"),
        json!({
            "id": &call_id,
            "name": tool_call.title,
            "arguments": tool_call.raw_input,
        }),
    );
    persist_tool_call(
        app,
        session_id,
        &call_id,
        &tool_call.title,
        &tool_call.raw_input,
    );
    if matches!(
        tool_call.status,
        ToolCallStatus::Completed | ToolCallStatus::Failed
    ) {
        let result = summarize_tool_call_content(&tool_call.content);
        let _ = app.emit(
            &format!("chat://{session_id}/tool_result"),
            json!({ "id": &call_id, "result": &result }),
        );
        persist_tool_result(app, session_id, &result);
        pending_tool_content.lock().unwrap().remove(&call_id);
    } else if !tool_call.content.is_empty() {
        // Rare (a tool call rarely arrives non-terminal with content
        // already attached) but cheap to handle for the same reason as the
        // `ToolCallUpdate` branch below: don't let a later update that
        // omits `content` read back as if there were never any output.
        pending_tool_content
            .lock()
            .unwrap()
            .insert(call_id, tool_call.content.clone());
    }
}

fn emit_tool_call_update(
    app: &AppHandle,
    session_id: &str,
    update: &ToolCallUpdate,
    pending_tool_content: &PendingToolCallContent,
) {
    let call_id = update.tool_call_id.to_string();

    // Some ACP agents don't include the tool's input in the initial
    // `ToolCall` notification and fill it in later via an update instead —
    // forward it live so the UI isn't stuck showing whatever (possibly
    // nothing) the first notification happened to carry. See
    // `chatEntries.ts`'s `updateToolArgs` for the other half.
    if let Some(raw_input) = &update.fields.raw_input {
        let _ = app.emit(
            &format!("chat://{session_id}/tool_call_args"),
            json!({ "id": &call_id, "arguments": raw_input }),
        );
        let state = app.state::<AppState>();
        db::update_tool_call_args(&state.db, session_id, &call_id, raw_input);
    }

    // `content` replaces rather than extends within a single update, but
    // across updates the last one seen is what should stick around — see
    // `PendingToolCallContent`'s doc comment.
    if let Some(content) = &update.fields.content {
        pending_tool_content
            .lock()
            .unwrap()
            .insert(call_id.clone(), content.clone());
    }

    let is_terminal = matches!(
        update.fields.status,
        Some(ToolCallStatus::Completed) | Some(ToolCallStatus::Failed)
    );
    if !is_terminal {
        return;
    }

    let content = pending_tool_content
        .lock()
        .unwrap()
        .remove(&call_id)
        .unwrap_or_default();
    let result = summarize_tool_call_content(&content);
    let _ = app.emit(
        &format!("chat://{session_id}/tool_result"),
        json!({ "id": &call_id, "result": &result }),
    );
    // No matching `persist_tool_call` here — a `ToolCallUpdate` always
    // follows a `ToolCall` for the same id (this is just it reaching a
    // terminal state), and that already persisted the assistant/tool_calls
    // half via `emit_tool_call` above.
    persist_tool_result(app, session_id, &result);
}

/// Persists the "assistant announced this tool call" half as a real
/// `ChatMessage` — same shape `messagesToEntries` (`chatEntries.ts`) already
/// reconstructs tool entries from for the built-in loop, so ACP tool calls
/// survive an app restart too instead of only ever being forwarded live.
/// Empty `content` here matches how a tool-calls-only assistant turn is
/// represented elsewhere (e.g. `resume_after_background_subtask` in
/// `chat.rs`).
fn persist_tool_call(
    app: &AppHandle,
    session_id: &str,
    call_id: &str,
    name: &str,
    raw_input: &Option<serde_json::Value>,
) {
    let state = app.state::<AppState>();
    chat::push_message(
        &state,
        session_id,
        ChatMessage {
            role: "assistant".into(),
            content: String::new(),
            tool_calls: Some(vec![tools::ToolCall {
                id: Some(call_id.to_string()),
                function: tools::ToolCallFunction {
                    name: name.to_string(),
                    arguments: raw_input.clone().unwrap_or(serde_json::Value::Null),
                },
            }]),
        },
    );
}

/// The other half of a persisted tool call — see `persist_tool_call`.
fn persist_tool_result(app: &AppHandle, session_id: &str, result: &str) {
    let state = app.state::<AppState>();
    chat::push_message(
        &state,
        session_id,
        ChatMessage {
            role: "tool".into(),
            content: result.to_string(),
            tool_calls: None,
        },
    );
}

pub(super) fn summarize_tool_call_content(content: &[ToolCallContent]) -> String {
    let parts: Vec<String> = content
        .iter()
        .map(|item| match item {
            ToolCallContent::Content(c) => match &c.content {
                ContentBlock::Text(t) => t.text.clone(),
                _ => "[non-text content]".to_string(),
            },
            ToolCallContent::Diff(d) => format!("Modified {}", d.path.display()),
            ToolCallContent::Terminal(_) => "[terminal output not shown]".to_string(),
            _ => "[unsupported content]".to_string(),
        })
        .collect();
    if parts.is_empty() {
        "(no output)".to_string()
    } else {
        parts.join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::schema::v1::TextContent;

    #[test]
    fn summarizes_mixed_tool_call_content() {
        let content = vec![ToolCallContent::Content(
            agent_client_protocol::schema::v1::Content::new(ContentBlock::Text(TextContent::new(
                "hello",
            ))),
        )];
        assert_eq!(summarize_tool_call_content(&content), "hello");
        assert_eq!(summarize_tool_call_content(&[]), "(no output)");
    }
}
