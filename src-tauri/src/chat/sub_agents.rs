use super::agent_loop::{push_message, run_agent_loop};
use super::ChatMessage;
use crate::backend::NativeBackend;
use crate::state::AppState;
use crate::tools::{ToolCall, ToolCallFunction};
use serde_json::json;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

/// Runs an isolated sub-agent for the `spawn_sub_agent` tool: its own fresh
/// history (just the given prompt) and its own `chat://{sub_session_id}/...`
/// event stream, so the UI can render it as a nested thread under the
/// parent's `spawn_sub_agent` tool call. It shares the parent's cancellation
/// flag (stopping the parent stops any sub-agent it spawned) and scopes
/// AGENTS.md/skills/touched-directory tracking to the *parent* session, so
/// work the sub-agent does still counts toward the parent's directory
/// scoping. It cannot itself call `spawn_sub_agent` — sub-agents are capped
/// at one level deep.
///
/// Every message pushed during the run is durably persisted to SQLite via
/// `push_message`, just like a top-level session's — only the in-memory
/// `chat_sessions` copy is dropped once this returns (see below), so
/// `load_conversation_history`/`tools::read_sub_agent` can still recover the
/// full transcript afterward straight from disk.
///
/// This is a plain `fn` returning a boxed, type-erased future rather than an
/// `async fn` on purpose: `run_agent_loop` calls `execute_tool` which (for
/// the `spawn_sub_agent` tool) calls back into `run_sub_agent`, a genuine
/// cycle in the call graph. An `async fn`'s return type is an opaque type inferred from
/// its body, and rustc can't resolve that inference through a structural
/// cycle (`error[E0391]: cycle detected when computing type of opaque`) even
/// with `Box::pin` at the call site — boxing there only fixes the infinite
/// *size* problem, not the type-inference cycle. Giving this function an
/// explicit, already-concrete signature (`Pin<Box<dyn Future + Send>>`)
/// breaks the cycle: callers see a fixed type immediately, with nothing left
/// to infer.
#[allow(clippy::too_many_arguments)]
pub(crate) fn run_sub_agent<'a>(
    app: &'a AppHandle,
    state: &'a State<'a, AppState>,
    parent_session_id: &'a str,
    sub_session_id: &'a str,
    prompt: &'a str,
    native: &'a NativeBackend,
    cancel_flag: &'a Arc<AtomicBool>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, String>> + Send + 'a>> {
    Box::pin(async move {
        push_message(
            state,
            sub_session_id,
            ChatMessage {
                role: "user".into(),
                content: prompt.to_string(),
                tool_calls: None,
            },
        );

        let loop_result = run_agent_loop(
            app,
            state,
            sub_session_id,
            parent_session_id,
            native,
            cancel_flag,
            false,
        )
        .await;

        let final_text = state
            .chat_sessions
            .lock()
            .unwrap()
            .remove(sub_session_id)
            .and_then(|history| {
                history
                    .into_iter()
                    .rev()
                    .find(|m| m.role == "assistant" && !m.content.is_empty())
                    .map(|m| m.content)
            });

        // Every outcome leaves a real assistant message as the last one in
        // this sub-agent's own transcript: `db::get_sub_agent_for_parent`/
        // `list_sub_agents_for_parent` read its result as "its last
        // message", and the handed-back text alone only reaches the
        // *parent's* transcript (`record_sub_agent_result`).
        //
        // A loop error is an error even if some text came out first — `Err`
        // makes the caller (`sub_agent_tools.rs`) record it as failed and
        // format the result as `"Error: {e}"`, the same text pushed here and
        // the same shape `AcpBackend::run_task` uses.
        let push_final = |text: String| {
            push_message(
                state,
                sub_session_id,
                ChatMessage {
                    role: "assistant".into(),
                    content: text,
                    tool_calls: None,
                },
            );
        };
        match (loop_result, final_text) {
            (Err(e), _) => {
                push_final(format!("Error: {e}"));
                Err(e)
            }
            (Ok(()), Some(text)) => Ok(text),
            (Ok(()), None) => {
                let text = "Subtask finished without a final response.".to_string();
                push_final(text.clone());
                Ok(text)
            }
        }
    })
}

/// Persists and emits the `sub_agent_result` tool-call/tool-result pair a
/// finished sub-agent's result is represented as in `session_id`'s own
/// transcript — a real pair, not a bare injected message, so it renders in
/// the UI exactly like any other tool call (live, via these two events; and
/// on reload, via `messagesToEntries`' existing assistant-tool_calls/tool
/// pairing) instead of being an invisible, dangling `tool`-role message with
/// nothing to attach it to.
///
/// Shared by both backends' `deliver_task_result` — native
/// (`backend/native.rs`) and ACP (`acp/backend.rs`). For the ACP case this is
/// *purely* AI Leash's own UI/history — ACP has no way to inject a synthetic
/// historical tool call into the agent's own context, so what's actually
/// sent to that subprocess is still a plain-text prompt; without this call,
/// that prompt would have no visible transcript entry in AI Leash at all.
pub(crate) fn record_sub_agent_result(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    sub_session_id: &str,
    description: &str,
    result: &str,
) {
    let call_id = Uuid::new_v4().to_string();
    let arguments = json!({ "sub_session_id": sub_session_id, "description": description });

    push_message(
        state,
        session_id,
        ChatMessage {
            role: "assistant".into(),
            content: String::new(),
            tool_calls: Some(vec![ToolCall {
                id: Some(call_id.clone()),
                function: ToolCallFunction {
                    name: "sub_agent_result".into(),
                    arguments: arguments.clone(),
                },
            }]),
        },
    );
    let _ = app.emit(
        &format!("chat://{session_id}/tool_call"),
        json!({ "id": call_id, "name": "sub_agent_result", "arguments": arguments }),
    );

    push_message(
        state,
        session_id,
        ChatMessage {
            role: "tool".into(),
            content: result.to_string(),
            tool_calls: None,
        },
    );
    let _ = app.emit(
        &format!("chat://{session_id}/tool_result"),
        json!({ "id": call_id, "result": result }),
    );
}
