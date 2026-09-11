use super::ChatMessage;
use crate::commands;
use crate::context;
use crate::db;
use crate::provider::{self, ProviderConfig, ProviderError};
use crate::state::AppState;
use crate::tools;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

const MAX_TOOL_ITERATIONS: usize = 15;
const MAX_MALFORMED_TOOL_CALL_RETRIES: usize = 2;

fn session_lock(state: &AppState, session_id: &str) -> Arc<tokio::sync::Mutex<()>> {
    state
        .session_locks
        .lock()
        .unwrap()
        .entry(session_id.to_string())
        .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
        .clone()
}

/// Serializes every turn for a given session — whether it's a normal
/// user-initiated `send_prompt`/`retry_last`, or a background subtask
/// autonomously resuming the conversation (see `resume_after_background_subtask`)
/// — so the two can never interleave writes to the same session's history.
///
/// Also the single choke point for the `chat://{session_id}/generating`
/// events the frontend uses to know a session is busy — emitted here rather
/// than at each call site (`send_prompt`, `retry_last`,
/// `resume_after_background_subtask`) specifically so a background subtask
/// autonomously resuming the conversation (no frontend action kicks that
/// off) still reports it's working, not just user-initiated turns. This is
/// what lets the left sidebar show a project as generating even while
/// you're looking at a different one — see `LeftBar.tsx`, which is always
/// mounted and subscribes to this event for every known project regardless
/// of which one's currently open.
///
/// `autonomous` distinguishes *why* this turn is running: `false` for
/// `send_prompt`/`retry_last` (the user is actually waiting on this one),
/// `true` for `resume_after_background_subtask` (the model reacting to a
/// finished sub-agent on its own — nothing the user did or is necessarily
/// watching for). The event payload carries both fields so `LeftBar.tsx`'s
/// sidebar busy-dot (which should light up for *any* activity) and
/// `ChatPanel.tsx`'s own Stop-button/input-disabling (which should only
/// reflect a turn the user is actually waiting on) can each use the field
/// that matters to them, off the one event.
#[allow(clippy::too_many_arguments)]
pub(super) async fn run_with_cancellation(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    scope_id: &str,
    provider: &ProviderConfig,
    model: &str,
    allow_subtasks: bool,
    autonomous: bool,
) -> Result<(), String> {
    let lock = session_lock(state.inner(), session_id);
    let _guard = lock.lock().await;

    let cancel_flag = Arc::new(AtomicBool::new(false));
    state
        .cancellations
        .lock()
        .unwrap()
        .insert(session_id.to_string(), cancel_flag.clone());
    let _ = app.emit(
        &format!("chat://{session_id}/generating"),
        json!({ "active": true, "autonomous": autonomous }),
    );

    let result = run_agent_loop(
        app,
        state,
        session_id,
        scope_id,
        provider,
        model,
        &cancel_flag,
        allow_subtasks,
    )
    .await;

    state.cancellations.lock().unwrap().remove(session_id);
    let _ = app.emit(
        &format!("chat://{session_id}/generating"),
        json!({ "active": false, "autonomous": autonomous }),
    );
    result
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn run_agent_loop(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    scope_id: &str,
    provider: &ProviderConfig,
    model: &str,
    cancel_flag: &Arc<AtomicBool>,
    allow_subtasks: bool,
) -> Result<(), String> {
    let chunk_event = format!("chat://{}/chunk", session_id);
    let thinking_event = format!("chat://{}/thinking", session_id);
    let done_event = format!("chat://{}/done", session_id);
    let error_event = format!("chat://{}/error", session_id);
    let tool_call_event = format!("chat://{}/tool_call", session_id);
    let tool_result_event = format!("chat://{}/tool_result", session_id);
    let usage_event = format!("chat://{}/usage", session_id);

    let root = commands::get_root_path(state.inner()).ok();
    let mut last_call: Option<(String, Value)> = None;

    for _ in 0..MAX_TOOL_ITERATIONS {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = app.emit(&done_event, ());
            return Ok(());
        }

        // Recomputed every iteration: a tool call earlier in this same loop
        // may have just touched a new subfolder, and its scoped AGENTS.md /
        // skills should apply starting with the very next model call.
        let touched = touched_dirs_for(state, scope_id);
        if let Some(r) = &root {
            refresh_system_prompt(app, state, session_id, r, &touched);
        }

        let history = {
            let sessions = state.chat_sessions.lock().unwrap();
            sessions.get(session_id).cloned().unwrap_or_default()
        };

        // Reserved before the first attempt so `stream_turn` can flush the
        // reply to disk as it streams — see `start_streaming_assistant_message`.
        // Reused (reset to empty) across retries below rather than
        // re-reserved, so a retried turn doesn't leave a stale empty row
        // behind from the failed attempt.
        let assistant_message_id = start_streaming_assistant_message(state, session_id);

        // Providers occasionally fail a turn outright with a transient hiccup
        // (e.g. Ollama's "error parsing tool call" 500 when the model's own
        // output mixes raw reasoning text into where clean JSON is expected,
        // or a 429/5xx from an OpenAI-compatible host) — not a real error
        // condition. Retrying the exact same request a couple of times
        // usually gets a well-formed response without bothering the user.
        let mut attempt = 0;
        let turn = loop {
            if let Some(id) = assistant_message_id {
                db::update_streaming_message(&state.db, id, "");
            }
            match provider::stream_turn(
                app,
                provider,
                model,
                &history,
                &chunk_event,
                &thinking_event,
                &error_event,
                cancel_flag,
                root.as_deref(),
                &touched,
                allow_subtasks,
                assistant_message_id,
            )
            .await
            {
                Ok(t) => break t,
                Err(ProviderError::Transient(_)) if attempt < MAX_MALFORMED_TOOL_CALL_RETRIES => {
                    attempt += 1;
                }
                Err(ProviderError::Transient(_)) => {
                    let msg = "The model kept producing malformed tool calls that the provider couldn't parse, even after retrying. Try again, simplify the request, or switch to a model that handles tool calling more reliably.".to_string();
                    let _ = app.emit(&error_event, &msg);
                    return Err(msg);
                }
                Err(ProviderError::Fatal(e)) => {
                    let _ = app.emit(&error_event, &e);
                    return Err(e);
                }
            }
        };

        if let (Some(p), Some(c)) = (turn.prompt_tokens, turn.completion_tokens) {
            let _ = app.emit(
                &usage_event,
                json!({ "promptTokens": p, "completionTokens": c }),
            );
        }

        let assistant_message = ChatMessage {
            role: "assistant".into(),
            content: turn.content,
            tool_calls: turn.tool_calls.clone(),
        };
        match assistant_message_id {
            Some(id) => {
                db::finish_streaming_message(
                    &state.db,
                    id,
                    &assistant_message.content,
                    &assistant_message.tool_calls,
                );
                remember_in_memory(state, session_id, assistant_message);
            }
            None => push_message(state, session_id, assistant_message),
        }

        if cancel_flag.load(Ordering::SeqCst) {
            let _ = app.emit(&done_event, ());
            return Ok(());
        }

        let calls = match turn.tool_calls {
            Some(c) if !c.is_empty() => c,
            _ => {
                let _ = app.emit(&done_event, ());
                return Ok(());
            }
        };

        for call in calls {
            if cancel_flag.load(Ordering::SeqCst) {
                let _ = app.emit(&done_event, ());
                return Ok(());
            }

            let _ = app.emit(
                &tool_call_event,
                json!({
                    "id": call.id,
                    "name": call.function.name,
                    "arguments": call.function.arguments,
                }),
            );

            let is_repeat = last_call.as_ref()
                == Some(&(call.function.name.clone(), call.function.arguments.clone()));

            let result = if is_repeat {
                format!(
                    "You already called `{}` with these exact same arguments and got the result above. Repeating it again will not help. Use what you already know to take a different, concrete action now (e.g. call edit_file to make the change), or tell the user what's blocking you.",
                    call.function.name
                )
            } else {
                tools::execute_tool(
                    app,
                    state,
                    scope_id,
                    call.id.as_deref(),
                    provider,
                    model,
                    &call.function.name,
                    &call.function.arguments,
                )
                .await
                .unwrap_or_else(|e| format!("Error: {e}"))
            };
            last_call = Some((call.function.name.clone(), call.function.arguments.clone()));

            let _ = app.emit(
                &tool_result_event,
                json!({ "id": call.id, "result": &result }),
            );
            push_message(
                state,
                session_id,
                ChatMessage {
                    role: "tool".into(),
                    content: result,
                    tool_calls: None,
                },
            );
        }
    }

    let msg =
        format!("Stopped after {MAX_TOOL_ITERATIONS} tool-call iterations without finishing.");
    let _ = app.emit(&error_event, &msg);
    Err(msg)
}

/// Rebuilds AGENTS.md/memory/skills and keeps them as the first (system)
/// message in history, refreshed on every turn rather than only once at the
/// start of a session — otherwise editing AGENTS.md (or adding a skill) after
/// a session already started would never be picked up for that session.
fn refresh_system_prompt(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    root: &std::path::Path,
    touched_dirs: &[std::path::PathBuf],
) {
    let mut sessions = state.chat_sessions.lock().unwrap();
    let history = sessions.entry(session_id.to_string()).or_default();
    let system_prompt = context::build_system_prompt(root, touched_dirs);
    let has_system_first = history.first().is_some_and(|m| m.role == "system");

    let _ = app.emit(
        &format!("chat://{session_id}/system_prompt"),
        &system_prompt,
    );

    match (has_system_first, system_prompt) {
        (true, Some(content)) => history[0].content = content,
        (true, None) => {
            history.remove(0);
        }
        (false, Some(content)) => history.insert(
            0,
            ChatMessage {
                role: "system".into(),
                content,
                tool_calls: None,
            },
        ),
        (false, None) => {}
    }
}

fn touched_dirs_for(state: &State<'_, AppState>, session_id: &str) -> Vec<std::path::PathBuf> {
    state
        .touched_dirs
        .lock()
        .unwrap()
        .get(session_id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .collect()
}

/// `pub(crate)` so `acp.rs` can persist ACP-backed turns through the same
/// SQLite + in-memory path the built-in loop already uses.
pub(crate) fn push_message(state: &State<'_, AppState>, session_id: &str, message: ChatMessage) {
    if let Ok(root) = commands::get_root_path(state.inner()) {
        db::save_message(&state.db, session_id, &root.to_string_lossy(), &message);
    }
    remember_in_memory(state, session_id, message);
}

/// The in-memory half of `push_message`, split out for
/// `start_streaming_assistant_message`'s callers: they persist the assistant
/// turn to disk incrementally as it streams (see `provider::stream_turn`'s
/// `message_id` param) rather than in one `save_message` INSERT at the end,
/// so this is all that's left to do once the turn is fully known.
pub(crate) fn remember_in_memory(
    state: &State<'_, AppState>,
    session_id: &str,
    message: ChatMessage,
) {
    state
        .chat_sessions
        .lock()
        .unwrap()
        .entry(session_id.to_string())
        .or_default()
        .push(message);
}

/// Reserves a row for the assistant's reply before a single token of it has
/// arrived, so `provider::stream_turn` can flush accumulated content into it
/// on every chunk (`db::update_streaming_message`) instead of only once the
/// full turn finishes — otherwise an app crash mid-reply loses the whole
/// message instead of just whatever arrived after the last flush. `None`
/// when there's no resolvable project root (mirrors `push_message`'s own
/// `commands::get_root_path` guard) — callers fall back to a plain
/// `push_message` at the end in that case.
pub(crate) fn start_streaming_assistant_message(
    state: &State<'_, AppState>,
    session_id: &str,
) -> Option<i64> {
    start_streaming_message(state, session_id, "assistant")
}

/// General form of `start_streaming_assistant_message` — used by
/// `acp/events.rs` to reserve a row for a "thinking" run as well as an
/// "assistant" one, since a single ACP turn can freely alternate between the
/// two (and tool calls) any number of times before it resolves.
pub(crate) fn start_streaming_message(
    state: &State<'_, AppState>,
    session_id: &str,
    role: &str,
) -> Option<i64> {
    let root = commands::get_root_path(state.inner()).ok()?;
    Some(db::start_streaming_message(
        &state.db,
        session_id,
        &root.to_string_lossy(),
        role,
    ))
}
