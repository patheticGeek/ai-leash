use super::agent_loop::{push_message, run_agent_loop, run_with_cancellation};
use super::ChatMessage;
use crate::provider::ProviderConfig;
use crate::state::AppState;
use crate::tools::{ToolCall, ToolCallFunction};
use serde_json::json;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
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
    provider: &'a ProviderConfig,
    model: &'a str,
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
            provider,
            model,
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

        match (final_text, loop_result) {
            (Some(text), _) => Ok(text),
            (None, Err(e)) => Ok(format!("Subtask failed: {e}")),
            (None, Ok(())) => Ok("Subtask finished without a final response.".to_string()),
        }
    })
}

/// Called from the detached background task every `spawn_sub_agent`-spawned
/// subtask runs in (see `tools.rs`) once it finishes — *after* the turn that
/// launched it has already returned to the model. Injects that subtask's
/// result into the session's history as if it just arrived, then
/// autonomously runs another turn so the main agent gets a chance to react —
/// nothing about this is triggered by the user clicking send.
/// `run_with_cancellation`'s per-session lock is what keeps this from racing
/// a real `send_prompt`/`retry_last` call or another subtask's resume
/// happening at the same time.
/// Same reasoning as `run_sub_agent`'s doc comment: this closes a second
/// recursive cycle (`execute_tool`'s `spawn_sub_agent` arm spawns a task that calls this,
/// which calls `run_with_cancellation` -> `run_agent_loop` -> `execute_tool`
/// again), so it needs the same explicit boxed-future signature rather than
/// being a plain `async fn`.
pub(crate) fn resume_after_background_subtask(
    app: AppHandle,
    session_id: String,
    provider: ProviderConfig,
    model: String,
    sub_session_id: String,
    description: String,
    result: String,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>> {
    Box::pin(async move {
        let state = app.state::<AppState>();

        // Represented as a real tool call/result pair — not a bare injected
        // message — so it renders in the UI exactly like any other tool
        // call (live, via these two events; and on reload, via
        // `messagesToEntries`' existing assistant-tool_calls/tool pairing)
        // instead of being an invisible, dangling `tool`-role message with
        // nothing to attach it to.
        let call_id = Uuid::new_v4().to_string();
        let arguments = json!({ "sub_session_id": sub_session_id, "description": description });

        push_message(
            &state,
            &session_id,
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
            &state,
            &session_id,
            ChatMessage {
                role: "tool".into(),
                content: result.clone(),
                tool_calls: None,
            },
        );
        let _ = app.emit(
            &format!("chat://{session_id}/tool_result"),
            json!({ "id": call_id, "result": &result }),
        );

        let _ = run_with_cancellation(
            &app,
            &state,
            &session_id,
            &session_id,
            &provider,
            &model,
            true,
            true,
        )
        .await;
    })
}
