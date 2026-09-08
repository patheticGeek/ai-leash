use crate::commands;
use crate::context;
use crate::db::{self, PersistedMessage};
use crate::provider::{self, ProviderConfig, ProviderError};
use crate::state::AppState;
use crate::tools::{self, ToolCall, ToolCallFunction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

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

const MAX_TOOL_ITERATIONS: usize = 15;
const MAX_MALFORMED_TOOL_CALL_RETRIES: usize = 2;

#[tauri::command]
pub fn cancel_prompt(state: State<AppState>, session_id: String) -> Result<(), String> {
    if let Some(flag) = state.cancellations.lock().unwrap().get(&session_id) {
        flag.store(true, Ordering::SeqCst);
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
        .map(|m| ChatMessage { role: m.role, content: m.content, tool_calls: m.tool_calls })
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
    app: AppHandle,
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

    run_with_cancellation(&app, &state, &session_id, &session_id, &provider, &model, true, false)
        .await
}

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
pub fn run_sub_agent<'a>(
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
pub fn resume_after_background_subtask(
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
            &app, &state, &session_id, &session_id, &provider, &model, true, true,
        )
        .await;
    })
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

    let _ = app.emit(&format!("chat://{session_id}/system_prompt"), &system_prompt);

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

/// Drops trailing assistant/tool messages back to the last user message, then
/// re-runs generation on the existing history. Used for both "regenerate this
/// response" (last message is assistant/tool) and "retry this message" (last
/// message is already the user's, e.g. a previous attempt errored before any
/// reply came back) — in both cases the effect is "answer the last user
/// message again from scratch".
#[tauri::command]
pub async fn retry_last(
    app: AppHandle,
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

    run_with_cancellation(&app, &state, &session_id, &session_id, &provider, &model, true, false)
        .await
}

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
async fn run_with_cancellation(
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
async fn run_agent_loop(
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

        // Providers occasionally fail a turn outright with a transient hiccup
        // (e.g. Ollama's "error parsing tool call" 500 when the model's own
        // output mixes raw reasoning text into where clean JSON is expected,
        // or a 429/5xx from an OpenAI-compatible host) — not a real error
        // condition. Retrying the exact same request a couple of times
        // usually gets a well-formed response without bothering the user.
        let mut attempt = 0;
        let turn = loop {
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

        push_message(
            state,
            session_id,
            ChatMessage {
                role: "assistant".into(),
                content: turn.content,
                tool_calls: turn.tool_calls.clone(),
            },
        );

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
    state
        .chat_sessions
        .lock()
        .unwrap()
        .entry(session_id.to_string())
        .or_default()
        .push(message);
}

/// Hydrates `session_id`'s in-memory history from disk the first time it's
/// asked for in this run (e.g. reopening a project after an app restart —
/// see `panelStateByConversation`/`CenterPanel.tsx` on the frontend for how
/// `session_id` ends up equal to the project's path), and returns it either
/// way so the frontend can render it. Once a session has any in-memory
/// history, this returns that as-is rather than re-reading disk — also used
/// as-is by the frontend to (re)load a finished sub-agent's full transcript,
/// since its id round-trips through disk exactly like any other session's.
#[tauri::command]
pub fn load_conversation_history(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<PersistedMessage>, String> {
    let mut sessions = state.chat_sessions.lock().unwrap();
    if let Some(existing) = sessions.get(&session_id) {
        return Ok(existing
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| PersistedMessage {
                role: m.role.clone(),
                content: m.content.clone(),
                tool_calls: m.tool_calls.clone(),
                created_at: 0,
            })
            .collect());
    }

    let messages = db::load_messages(&state.db, &session_id);
    sessions.insert(
        session_id,
        messages
            .iter()
            .map(|m| ChatMessage {
                role: m.role.clone(),
                content: m.content.clone(),
                tool_calls: m.tool_calls.clone(),
            })
            .collect(),
    );
    Ok(messages)
}

/// All sub-agents ever spawned, across every project — the Sub Agents
/// sidebar's own scope (a cross-project history, not scoped to whichever
/// project is currently open). See `db::list_all_sub_agents`.
#[tauri::command]
pub fn list_sub_agents(state: State<AppState>) -> Result<Vec<db::SubAgentSummary>, String> {
    Ok(db::list_all_sub_agents(&state.db))
}

