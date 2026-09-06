use crate::commands;
use crate::context;
use crate::state::AppState;
use crate::tools::{self, ToolCall};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Serialize)]
struct OllamaChatRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    stream: bool,
    tools: Value,
}

#[derive(Deserialize)]
struct OllamaChatChunk {
    message: Option<OllamaChunkMessage>,
    #[serde(default)]
    done: bool,
    #[serde(default)]
    prompt_eval_count: Option<u64>,
    #[serde(default)]
    eval_count: Option<u64>,
}

#[derive(Deserialize)]
struct OllamaChunkMessage {
    #[serde(default)]
    content: String,
    #[serde(default)]
    thinking: String,
    #[serde(default)]
    tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModelInfo>,
}

#[derive(Deserialize)]
struct OllamaModelInfo {
    name: String,
    #[serde(default)]
    details: Option<OllamaModelDetails>,
}

#[derive(Deserialize)]
struct OllamaModelDetails {
    #[serde(default)]
    context_length: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSummary {
    pub name: String,
    pub context_length: Option<u64>,
}

struct TurnResult {
    content: String,
    tool_calls: Option<Vec<ToolCall>>,
    prompt_tokens: Option<u64>,
    completion_tokens: Option<u64>,
}

const MAX_TOOL_ITERATIONS: usize = 15;
const MAX_MALFORMED_TOOL_CALL_RETRIES: usize = 2;

#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<ModelSummary>, String> {
    let resp = reqwest::get("http://localhost:11434/api/tags")
        .await
        .map_err(|e| e.to_string())?;
    let tags: OllamaTagsResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(tags
        .models
        .into_iter()
        .map(|m| ModelSummary {
            name: m.name,
            context_length: m.details.and_then(|d| d.context_length),
        })
        .collect())
}

#[tauri::command]
pub fn cancel_prompt(state: State<AppState>, session_id: String) -> Result<(), String> {
    if let Some(flag) = state.cancellations.lock().unwrap().get(&session_id) {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
pub async fn send_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
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

    run_with_cancellation(&app, &state, &session_id, &session_id, &model, true).await
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
pub fn run_sub_agent<'a>(
    app: &'a AppHandle,
    state: &'a State<'a, AppState>,
    parent_session_id: &'a str,
    sub_session_id: &'a str,
    prompt: &'a str,
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

/// Called from a detached background task (see the `spawn_sub_agent` tool's `"each"`
/// interrupt mode in `tools.rs`) once one of several concurrently-spawned
/// subtasks finishes *after* the turn that launched them has already
/// returned. Injects that subtask's result into the session's history as if
/// it just arrived, then autonomously runs another turn so the main agent
/// gets a chance to react — nothing about this is triggered by the user
/// clicking send. `run_with_cancellation`'s per-session lock is what keeps
/// this from racing a real `send_prompt`/`retry_last` call or another
/// subtask's resume happening at the same time.
/// Same reasoning as `run_sub_agent`'s doc comment: this closes a second
/// recursive cycle (`execute_tool`'s `spawn_sub_agent` arm spawns a task that calls this,
/// which calls `run_with_cancellation` -> `run_agent_loop` -> `execute_tool`
/// again), so it needs the same explicit boxed-future signature rather than
/// being a plain `async fn`.
pub fn resume_after_background_subtask(
    app: AppHandle,
    session_id: String,
    model: String,
    description: String,
    result: String,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>> {
    Box::pin(async move {
        let state = app.state::<AppState>();
        push_message(
            &state,
            &session_id,
            ChatMessage {
                role: "tool".into(),
                content: format!("Background subtask \"{description}\" finished:\n\n{result}"),
                tool_calls: None,
            },
        );
        let _ = run_with_cancellation(&app, &state, &session_id, &session_id, &model, true).await;
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

    run_with_cancellation(&app, &state, &session_id, &session_id, &model, true).await
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
async fn run_with_cancellation(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    scope_id: &str,
    model: &str,
    allow_subtasks: bool,
) -> Result<(), String> {
    let lock = session_lock(state.inner(), session_id);
    let _guard = lock.lock().await;

    let cancel_flag = Arc::new(AtomicBool::new(false));
    state
        .cancellations
        .lock()
        .unwrap()
        .insert(session_id.to_string(), cancel_flag.clone());

    let result = run_agent_loop(
        app,
        state,
        session_id,
        scope_id,
        model,
        &cancel_flag,
        allow_subtasks,
    )
    .await;

    state.cancellations.lock().unwrap().remove(session_id);
    result
}

#[allow(clippy::too_many_arguments)]
async fn run_agent_loop(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    scope_id: &str,
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

        // Ollama occasionally fails a turn outright with a 500 "error parsing
        // tool call" when the model's own output mixes raw reasoning text
        // into where Ollama expects clean JSON — a transient sampling
        // hiccup on the model's end, not a real error condition. Retrying
        // the exact same request a couple of times usually gets a
        // well-formed response without bothering the user.
        let mut attempt = 0;
        let turn = loop {
            match stream_one_turn(
                app,
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
                Err(e)
                    if attempt < MAX_MALFORMED_TOOL_CALL_RETRIES
                        && e.contains("error parsing tool call") =>
                {
                    attempt += 1;
                }
                Err(e) => {
                    // Ollama echoes the model's entire malformed generation
                    // (often its full reasoning text) back inside the JSON
                    // error body — not useful to show as-is once we're
                    // giving up on it.
                    let msg = if e.contains("error parsing tool call") {
                        "The model kept producing malformed tool calls that Ollama couldn't parse, even after retrying. Try again, simplify the request, or switch to a model that handles tool calling more reliably.".to_string()
                    } else {
                        e
                    };
                    let _ = app.emit(&error_event, &msg);
                    return Err(msg);
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
                    model,
                    cancel_flag,
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

fn push_message(state: &State<'_, AppState>, session_id: &str, message: ChatMessage) {
    state
        .chat_sessions
        .lock()
        .unwrap()
        .entry(session_id.to_string())
        .or_default()
        .push(message);
}

#[allow(clippy::too_many_arguments)]
async fn stream_one_turn(
    app: &AppHandle,
    model: &str,
    history: &[ChatMessage],
    chunk_event: &str,
    thinking_event: &str,
    error_event: &str,
    cancel_flag: &Arc<AtomicBool>,
    root: Option<&std::path::Path>,
    touched_dirs: &[std::path::PathBuf],
    allow_subtasks: bool,
) -> Result<TurnResult, String> {
    let client = reqwest::Client::new();
    let body = OllamaChatRequest {
        model,
        messages: history,
        stream: true,
        tools: tools::tool_definitions(root, touched_dirs, allow_subtasks),
    };
    let resp = match client
        .post("http://localhost:11434/api/chat")
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return Err(format!("failed to reach ollama at localhost:11434: {e}"));
        }
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("ollama returned {status}: {body_text}"));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut full_content = String::new();
    let mut tool_calls: Option<Vec<ToolCall>> = None;
    let mut prompt_tokens: Option<u64> = None;
    let mut completion_tokens: Option<u64> = None;

    'outer: while let Some(item) = stream.next().await {
        if cancel_flag.load(Ordering::SeqCst) {
            return Ok(TurnResult {
                content: full_content,
                tool_calls: None,
                prompt_tokens,
                completion_tokens,
            });
        }

        let bytes = match item {
            Ok(b) => b,
            Err(e) => return Err(e.to_string()),
        };
        buf.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf.drain(..=pos);
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<OllamaChatChunk>(&line) {
                Ok(chunk) => {
                    if let Some(msg) = chunk.message {
                        if !msg.thinking.is_empty() {
                            let _ = app.emit(thinking_event, &msg.thinking);
                        }
                        if !msg.content.is_empty() {
                            full_content.push_str(&msg.content);
                            let _ = app.emit(chunk_event, &msg.content);
                        }
                        if let Some(calls) = msg.tool_calls {
                            if !calls.is_empty() {
                                tool_calls = Some(calls);
                            }
                        }
                    }
                    if chunk.prompt_eval_count.is_some() {
                        prompt_tokens = chunk.prompt_eval_count;
                    }
                    if chunk.eval_count.is_some() {
                        completion_tokens = chunk.eval_count;
                    }
                    if chunk.done {
                        break 'outer;
                    }
                }
                Err(e) => {
                    let _ = app.emit(error_event, e.to_string());
                }
            }
        }
    }

    Ok(TurnResult {
        content: full_content,
        tool_calls,
        prompt_tokens,
        completion_tokens,
    })
}
