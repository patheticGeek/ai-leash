use crate::state::AppState;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize)]
struct OllamaChatRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaChatChunk {
    message: Option<OllamaChunkMessage>,
    #[serde(default)]
    done: bool,
}

#[derive(Deserialize)]
struct OllamaChunkMessage {
    content: String,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModelInfo>,
}

#[derive(Deserialize)]
struct OllamaModelInfo {
    name: String,
}

#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<String>, String> {
    let resp = reqwest::get("http://localhost:11434/api/tags")
        .await
        .map_err(|e| e.to_string())?;
    let tags: OllamaTagsResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

#[tauri::command]
pub async fn send_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    model: String,
    message: String,
) -> Result<(), String> {
    {
        let mut sessions = state.chat_sessions.lock().unwrap();
        sessions
            .entry(session_id.clone())
            .or_default()
            .push(ChatMessage {
                role: "user".into(),
                content: message,
            });
    }

    let history = {
        let sessions = state.chat_sessions.lock().unwrap();
        sessions.get(&session_id).cloned().unwrap_or_default()
    };

    let chunk_event = format!("chat://{}/chunk", session_id);
    let done_event = format!("chat://{}/done", session_id);
    let error_event = format!("chat://{}/error", session_id);

    let client = reqwest::Client::new();
    let body = OllamaChatRequest {
        model: &model,
        messages: &history,
        stream: true,
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
            let _ = app.emit(&error_event, &msg);
            return Err(msg);
        }
    };

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut full_reply = String::new();

    'outer: while let Some(item) = stream.next().await {
        let bytes = match item {
            Ok(b) => b,
            Err(e) => {
                let _ = app.emit(&error_event, e.to_string());
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
                        if !msg.content.is_empty() {
                            full_reply.push_str(&msg.content);
                            let _ = app.emit(&chunk_event, &msg.content);
                        }
                    }
                    if chunk.done {
                        break 'outer;
                    }
                }
                Err(e) => {
                    let _ = app.emit(&error_event, e.to_string());
                }
            }
        }
    }

    {
        let mut sessions = state.chat_sessions.lock().unwrap();
        sessions
            .entry(session_id.clone())
            .or_default()
            .push(ChatMessage {
                role: "assistant".into(),
                content: full_reply,
            });
    }

    let _ = app.emit(&done_event, ());
    Ok(())
}
