use crate::state::AppState;
use crate::tools::{self, ToolCall};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

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
}

const MAX_TOOL_ITERATIONS: usize = 15;

#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<String>, String> {
    let resp = reqwest::get("http://localhost:11434/api/tags")
        .await
        .map_err(|e| e.to_string())?;
    let tags: OllamaTagsResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(tags.models.into_iter().map(|m| m.name).collect())
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

    run_with_cancellation(&app, &state, &session_id, &model).await
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

    run_with_cancellation(&app, &state, &session_id, &model).await
}

async fn run_with_cancellation(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    model: &str,
) -> Result<(), String> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    state
        .cancellations
        .lock()
        .unwrap()
        .insert(session_id.to_string(), cancel_flag.clone());

    let result = run_agent_loop(app, state, session_id, model, &cancel_flag).await;

    state.cancellations.lock().unwrap().remove(session_id);
    result
}

async fn run_agent_loop(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    model: &str,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    let chunk_event = format!("chat://{}/chunk", session_id);
    let thinking_event = format!("chat://{}/thinking", session_id);
    let done_event = format!("chat://{}/done", session_id);
    let error_event = format!("chat://{}/error", session_id);
    let tool_call_event = format!("chat://{}/tool_call", session_id);
    let tool_result_event = format!("chat://{}/tool_result", session_id);

    let mut last_call: Option<(String, Value)> = None;

    for _ in 0..MAX_TOOL_ITERATIONS {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = app.emit(&done_event, ());
            return Ok(());
        }

        let history = {
            let sessions = state.chat_sessions.lock().unwrap();
            sessions.get(session_id).cloned().unwrap_or_default()
        };

        let (content, tool_calls) = stream_one_turn(
            app,
            model,
            &history,
            &chunk_event,
            &thinking_event,
            &error_event,
            cancel_flag,
        )
        .await?;

        push_message(
            state,
            session_id,
            ChatMessage {
                role: "assistant".into(),
                content,
                tool_calls: tool_calls.clone(),
            },
        );

        if cancel_flag.load(Ordering::SeqCst) {
            let _ = app.emit(&done_event, ());
            return Ok(());
        }

        let calls = match tool_calls {
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
                tools::execute_tool(app, state, &call.function.name, &call.function.arguments)
                    .await
                    .unwrap_or_else(|e| format!("Error: {e}"))
            };
            last_call = Some((call.function.name.clone(), call.function.arguments.clone()));

            let _ = app.emit(&tool_result_event, json!({ "id": call.id, "result": &result }));
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

    let msg = format!("Stopped after {MAX_TOOL_ITERATIONS} tool-call iterations without finishing.");
    let _ = app.emit(&error_event, &msg);
    Err(msg)
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

async fn stream_one_turn(
    app: &AppHandle,
    model: &str,
    history: &[ChatMessage],
    chunk_event: &str,
    thinking_event: &str,
    error_event: &str,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(String, Option<Vec<ToolCall>>), String> {
    let client = reqwest::Client::new();
    let body = OllamaChatRequest {
        model,
        messages: history,
        stream: true,
        tools: tools::tool_definitions(),
    };
    let resp = match client
        .post("http://localhost:11434/api/chat")
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("failed to reach ollama at localhost:11434: {e}");
            let _ = app.emit(error_event, &msg);
            return Err(msg);
        }
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        let msg = format!("ollama returned {status}: {body_text}");
        let _ = app.emit(error_event, &msg);
        return Err(msg);
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut full_content = String::new();
    let mut tool_calls: Option<Vec<ToolCall>> = None;

    'outer: while let Some(item) = stream.next().await {
        if cancel_flag.load(Ordering::SeqCst) {
            return Ok((full_content, None));
        }

        let bytes = match item {
            Ok(b) => b,
            Err(e) => {
                let _ = app.emit(error_event, e.to_string());
                return Err(e.to_string());
            }
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

    Ok((full_content, tool_calls))
}
