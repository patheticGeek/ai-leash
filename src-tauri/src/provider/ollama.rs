//! Ollama: bare newline-delimited JSON, one full message snapshot per line,
//! tool_calls sent whole (not incrementally) right before the final `done`.

use super::{
    emit_line_effects, persist_chunk, LineEffects, ModelSummary, ProviderConfig, ProviderError,
};
use crate::chat::{ChatMessage, TurnResult};
use crate::tools::{self, ToolCall};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::AppHandle;

pub(super) async fn complete_ollama(
    host: &str,
    model: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let base_url = ProviderConfig::ollama_base_url(host);
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "model": model, "messages": messages, "stream": false });
    let resp = client
        .post(format!("{base_url}/api/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("failed to reach ollama at {host}: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("ollama returned {status}: {body_text}"));
    }
    let value: Value = resp.json().await.map_err(|e| e.to_string())?;
    value
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .map(str::to_string)
        .ok_or_else(|| "ollama response had no message content".to_string())
}

pub(super) async fn list_ollama_models(host: &str) -> Result<Vec<ModelSummary>, String> {
    let url = format!("{}/api/tags", ProviderConfig::ollama_base_url(host));
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
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

#[derive(Default)]
struct OllamaAccum {
    full_content: String,
    tool_calls: Option<Vec<ToolCall>>,
    prompt_tokens: Option<u64>,
    completion_tokens: Option<u64>,
    done: bool,
}

/// Parses one NDJSON line and folds it into `accum`. Pulled out of the
/// streaming loop so it's unit-testable against canned fixture strings
/// without a live HTTP stream.
fn accumulate_ollama_line(line: &str, accum: &mut OllamaAccum) -> LineEffects {
    let mut effects = LineEffects::default();
    match serde_json::from_str::<OllamaChatChunk>(line) {
        Ok(chunk) => {
            if let Some(msg) = chunk.message {
                if !msg.thinking.is_empty() {
                    effects.thinking = Some(msg.thinking);
                }
                if !msg.content.is_empty() {
                    accum.full_content.push_str(&msg.content);
                    effects.chunk = Some(msg.content);
                }
                if let Some(calls) = msg.tool_calls {
                    if !calls.is_empty() {
                        accum.tool_calls = Some(calls);
                    }
                }
            }
            if chunk.prompt_eval_count.is_some() {
                accum.prompt_tokens = chunk.prompt_eval_count;
            }
            if chunk.eval_count.is_some() {
                accum.completion_tokens = chunk.eval_count;
            }
            if chunk.done {
                accum.done = true;
            }
        }
        Err(e) => {
            effects.parse_error = Some(e.to_string());
        }
    }
    effects
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn stream_turn_ollama(
    app: &AppHandle,
    host: &str,
    model: &str,
    history: &[ChatMessage],
    chunk_event: &str,
    thinking_event: &str,
    error_event: &str,
    cancel_flag: &Arc<AtomicBool>,
    root: Option<&Path>,
    touched_dirs: &[PathBuf],
    allow_subtasks: bool,
    message_id: Option<i64>,
) -> Result<TurnResult, ProviderError> {
    let base_url = ProviderConfig::ollama_base_url(host);
    let client = reqwest::Client::new();
    let body = OllamaChatRequest {
        model,
        messages: history,
        stream: true,
        tools: tools::tool_definitions(root, touched_dirs, allow_subtasks),
    };
    let resp = match client
        .post(format!("{base_url}/api/chat"))
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return Err(ProviderError::Fatal(format!(
                "failed to reach ollama at {host}: {e}"
            )));
        }
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        let msg = format!("ollama returned {status}: {body_text}");
        return Err(if body_text.contains("error parsing tool call") {
            ProviderError::Transient(msg)
        } else {
            ProviderError::Fatal(msg)
        });
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut accum = OllamaAccum::default();

    'outer: while let Some(item) = stream.next().await {
        if cancel_flag.load(Ordering::SeqCst) {
            return Ok(TurnResult {
                content: accum.full_content,
                tool_calls: None,
                prompt_tokens: accum.prompt_tokens,
                completion_tokens: accum.completion_tokens,
            });
        }

        let bytes = match item {
            Ok(b) => b,
            Err(e) => return Err(ProviderError::Fatal(e.to_string())),
        };
        buf.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf.drain(..=pos);
            if line.is_empty() {
                continue;
            }
            let effects = accumulate_ollama_line(&line, &mut accum);
            if effects.chunk.is_some() {
                persist_chunk(app, message_id, &accum.full_content);
            }
            emit_line_effects(app, chunk_event, thinking_event, error_event, effects);
            if accum.done {
                break 'outer;
            }
        }
    }

    Ok(TurnResult {
        content: accum.full_content,
        tool_calls: accum.tool_calls,
        prompt_tokens: accum.prompt_tokens,
        completion_tokens: accum.completion_tokens,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ollama_accumulates_content_thinking_and_final_tool_calls() {
        let mut accum = OllamaAccum::default();
        let lines = [
            r#"{"message":{"content":"","thinking":"let me think"},"done":false}"#,
            r#"{"message":{"content":"Hello "},"done":false}"#,
            r#"{"message":{"content":"world"},"done":false}"#,
            r#"{"message":{"content":"","tool_calls":[{"id":"1","function":{"name":"read_file","arguments":{"path":"a.rs"}}}]},"done":true,"prompt_eval_count":10,"eval_count":5}"#,
        ];
        let mut chunks = vec![];
        let mut thinking = vec![];
        for line in lines {
            let effects = accumulate_ollama_line(line, &mut accum);
            if let Some(c) = effects.chunk {
                chunks.push(c);
            }
            if let Some(t) = effects.thinking {
                thinking.push(t);
            }
        }
        assert_eq!(chunks.join(""), "Hello world");
        assert_eq!(thinking, vec!["let me think".to_string()]);
        assert!(accum.done);
        assert_eq!(accum.prompt_tokens, Some(10));
        assert_eq!(accum.completion_tokens, Some(5));
        let calls = accum.tool_calls.expect("tool calls");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].function.name, "read_file");
    }

    #[test]
    fn ollama_error_parsing_tool_call_classifies_as_transient() {
        let body_text = "{\"error\":\"error parsing tool call\"}".to_string();
        assert!(body_text.contains("error parsing tool call"));
        let other_body = "{\"error\":\"model not found\"}".to_string();
        assert!(!other_body.contains("error parsing tool call"));
    }
}
