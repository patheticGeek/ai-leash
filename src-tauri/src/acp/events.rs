use super::discovery::available_commands_payload;
use crate::chat::{self, ChatMessage};
use crate::db;
use crate::state::AppState;
use crate::tools;
use agent_client_protocol::schema::v1::{
    ContentBlock, SessionUpdate, ToolCall, ToolCallContent, ToolCallStatus, ToolCallUpdate,
};
use serde_json::json;
use std::sync::{Arc, Mutex as StdMutex};
use tauri::{AppHandle, Emitter, Manager};

pub(super) fn handle_session_notification(
    app: &AppHandle,
    session_id: &str,
    turn_text: &Arc<StdMutex<String>>,
    assistant_message_id: &Arc<StdMutex<Option<i64>>>,
    update: SessionUpdate,
) {
    match update {
        SessionUpdate::AgentMessageChunk(chunk) => {
            if let ContentBlock::Text(text) = chunk.content {
                let accumulated = {
                    let mut turn_text = turn_text.lock().unwrap();
                    turn_text.push_str(&text.text);
                    turn_text.clone()
                };
                let _ = app.emit(&format!("chat://{session_id}/chunk"), &text.text);

                // Reserve the row on the first chunk of a turn (rather than
                // upfront in `drive_acp_connection`) so a turn that only
                // makes tool calls never leaves a stray empty message behind
                // — see the doc comment where `assistant_message_id` is
                // declared. Every chunk after that just overwrites it.
                let state = app.state::<AppState>();
                let mut id_slot = assistant_message_id.lock().unwrap();
                if id_slot.is_none() {
                    *id_slot = chat::start_streaming_assistant_message(&state, session_id);
                }
                if let Some(id) = *id_slot {
                    db::update_streaming_message(&state.db, id, &accumulated);
                }
            }
        }
        SessionUpdate::AgentThoughtChunk(chunk) => {
            if let ContentBlock::Text(text) = chunk.content {
                let _ = app.emit(&format!("chat://{session_id}/thinking"), &text.text);
            }
        }
        SessionUpdate::ToolCall(tool_call) => emit_tool_call(app, session_id, &tool_call),
        SessionUpdate::ToolCallUpdate(update) => emit_tool_call_update(app, session_id, &update),
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

fn emit_tool_call(app: &AppHandle, session_id: &str, tool_call: &ToolCall) {
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
    }
}

fn emit_tool_call_update(app: &AppHandle, session_id: &str, update: &ToolCallUpdate) {
    let is_terminal = matches!(
        update.fields.status,
        Some(ToolCallStatus::Completed) | Some(ToolCallStatus::Failed)
    );
    if !is_terminal {
        return;
    }
    let content = update.fields.content.clone().unwrap_or_default();
    let result = summarize_tool_call_content(&content);
    let _ = app.emit(
        &format!("chat://{session_id}/tool_result"),
        json!({ "id": update.tool_call_id.to_string(), "result": &result }),
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
