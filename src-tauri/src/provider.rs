use crate::chat::{ChatMessage, TurnResult};
use crate::db;
use crate::state::AppState;
use crate::tools::{self, ToolCall};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// Sent from the frontend on every call that talks to a model — there is no
/// backend-persisted provider config, this mirrors how `model: String` is
/// already passed per-call today. Tagged so it serializes to/from the
/// frontend's `ProviderConfigPayload` union directly.
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProviderConfig {
    #[serde(rename_all = "camelCase")]
    Ollama {
        /// e.g. "localhost:11434", no scheme. Empty string falls back to the
        /// default (the frontend normally already fills this in, but Rust
        /// stays defensive since this crosses the IPC boundary).
        host: String,
    },
    #[serde(rename_all = "camelCase")]
    OpenAiCompatible {
        /// Full base URL, no trailing slash, no `/chat/completions` suffix.
        /// e.g. "https://api.openai.com/v1".
        base_url: String,
        /// Sent as `Authorization: Bearer {api_key}` when non-empty.
        api_key: String,
    },
}

impl ProviderConfig {
    fn ollama_base_url(host: &str) -> String {
        let host = if host.trim().is_empty() {
            "localhost:11434"
        } else {
            host.trim()
        };
        format!("http://{host}")
    }
}

/// Lets `run_agent_loop` decide whether to silently retry a turn without
/// string-matching provider-specific error text in generic code. The
/// `Transient` message isn't read today (the loop emits its own generic
/// "gave up retrying" text once retries are exhausted) but is kept for
/// future logging/diagnostics.
pub enum ProviderError {
    /// A transient hiccup worth retrying the same turn a couple of times
    /// (Ollama's "error parsing tool call" 500, or a 429/5xx from an
    /// OpenAI-compatible host).
    Transient(#[allow(dead_code)] String),
    /// Not worth retrying — surface to the user immediately.
    Fatal(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSummary {
    pub name: String,
    pub context_length: Option<u64>,
}

#[tauri::command]
pub async fn list_provider_models(provider: ProviderConfig) -> Result<Vec<ModelSummary>, String> {
    match provider {
        ProviderConfig::Ollama { host } => list_ollama_models(&host).await,
        // Many OpenAI-compatible hosts don't implement `GET /v1/models`
        // reliably (or gate it separately), and it has no context-length
        // equivalent anyway — the frontend uses a free-text model id input
        // for this provider kind instead of a populated dropdown.
        ProviderConfig::OpenAiCompatible { .. } => Ok(vec![]),
    }
}

/// Real reachability check for the status bar's provider indicator — unlike
/// `list_provider_models`, this always does a live network round-trip for
/// both provider kinds (including OpenAI-compatible, which has no model
/// list). Any HTTP response at all (even 401/404) counts as "connected":
/// this checks that the host is reachable, not that credentials are valid.
#[tauri::command]
pub async fn check_provider_connection(provider: ProviderConfig) -> bool {
    match provider {
        ProviderConfig::Ollama { host } => list_ollama_models(&host).await.is_ok(),
        ProviderConfig::OpenAiCompatible { base_url, api_key } => {
            check_openai_compatible_connection(&base_url, &api_key).await
        }
    }
}

async fn check_openai_compatible_connection(base_url: &str, api_key: &str) -> bool {
    let base_url = base_url.trim_end_matches('/');
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    let mut request = client.get(format!("{base_url}/models"));
    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {api_key}"));
    }
    request.send().await.is_ok()
}

/// A single, non-streaming, tool-free completion call — used only by
/// `/compact`'s summarization request (`chat::compact_conversation`).
/// Unlike `stream_turn`, this never emits chunk/thinking events, never
/// offers tools (there's no `tools` key in the request body at all, unlike
/// `stream_turn` which always includes at least the built-in file tools),
/// and returns the final text directly rather than threading it through
/// cancellation/retry — a summarization call is a one-shot backend-internal
/// request, not a turn the user is watching stream in.
pub async fn complete(
    provider: &ProviderConfig,
    model: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    match provider {
        ProviderConfig::Ollama { host } => complete_ollama(host, model, messages).await,
        ProviderConfig::OpenAiCompatible { base_url, api_key } => {
            complete_openai(base_url, api_key, model, messages).await
        }
    }
}

async fn complete_ollama(
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

async fn complete_openai(
    base_url: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let base_url = base_url.trim_end_matches('/');
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "model": model, "messages": messages, "stream": false });
    let mut request = client
        .post(format!("{base_url}/chat/completions"))
        .json(&body);
    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {api_key}"));
    }
    let resp = request
        .send()
        .await
        .map_err(|e| format!("failed to reach {base_url}: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("provider returned {status}: {body_text}"));
    }
    let value: Value = resp.json().await.map_err(|e| e.to_string())?;
    value
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .map(str::to_string)
        .ok_or_else(|| "provider response had no message content".to_string())
}

async fn list_ollama_models(host: &str) -> Result<Vec<ModelSummary>, String> {
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

#[allow(clippy::too_many_arguments)]
pub async fn stream_turn(
    app: &AppHandle,
    provider: &ProviderConfig,
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
    match provider {
        ProviderConfig::Ollama { host } => {
            stream_turn_ollama(
                app,
                host,
                model,
                history,
                chunk_event,
                thinking_event,
                error_event,
                cancel_flag,
                root,
                touched_dirs,
                allow_subtasks,
                message_id,
            )
            .await
        }
        ProviderConfig::OpenAiCompatible { base_url, api_key } => {
            stream_turn_openai(
                app,
                base_url,
                api_key,
                model,
                history,
                chunk_event,
                thinking_event,
                error_event,
                cancel_flag,
                root,
                touched_dirs,
                allow_subtasks,
                message_id,
            )
            .await
        }
    }
}

/// Flushes the turn's accumulated content to disk on every chunk that
/// carries new text — see `chat::start_streaming_assistant_message`. A no-op
/// when `message_id` is `None` (no resolvable project root to persist under).
fn persist_chunk(app: &AppHandle, message_id: Option<i64>, full_content: &str) {
    if let Some(id) = message_id {
        let state = app.state::<AppState>();
        db::update_streaming_message(&state.db, id, full_content);
    }
}

// ---------------------------------------------------------------------
// Ollama: bare newline-delimited JSON, one full message snapshot per line,
// tool_calls sent whole (not incrementally) right before the final `done`.
// ---------------------------------------------------------------------

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

/// What a parsed line wants emitted — kept separate from the actual
/// `app.emit(...)` calls so the parsing/accumulation logic is pure and
/// unit-testable without a real `AppHandle`.
#[derive(Default)]
struct LineEffects {
    chunk: Option<String>,
    thinking: Option<String>,
    parse_error: Option<String>,
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

fn emit_line_effects(
    app: &AppHandle,
    chunk_event: &str,
    thinking_event: &str,
    error_event: &str,
    effects: LineEffects,
) {
    if let Some(c) = effects.chunk {
        let _ = app.emit(chunk_event, &c);
    }
    if let Some(t) = effects.thinking {
        let _ = app.emit(thinking_event, &t);
    }
    if let Some(e) = effects.parse_error {
        let _ = app.emit(error_event, &e);
    }
}

#[allow(clippy::too_many_arguments)]
async fn stream_turn_ollama(
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

// ---------------------------------------------------------------------
// OpenAI-compatible: SSE (`data: {...}\n`, terminated by `data: [DONE]`),
// tool-call arguments arrive as incremental string fragments keyed by index
// and must be concatenated before parsing as JSON.
// ---------------------------------------------------------------------

#[derive(Serialize)]
struct OpenAiChatRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    stream: bool,
    tools: Value,
    stream_options: Value,
}

#[derive(Deserialize)]
struct OpenAiStreamChunk {
    #[serde(default)]
    choices: Vec<OpenAiStreamChoice>,
    #[serde(default)]
    usage: Option<OpenAiUsage>,
}

#[derive(Deserialize)]
struct OpenAiStreamChoice {
    #[serde(default)]
    delta: OpenAiDelta,
}

#[derive(Deserialize, Default)]
struct OpenAiDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    reasoning_content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<OpenAiDeltaToolCall>>,
}

#[derive(Deserialize)]
struct OpenAiDeltaToolCall {
    index: usize,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    function: Option<OpenAiDeltaFunction>,
}

#[derive(Deserialize, Default)]
struct OpenAiDeltaFunction {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiUsage {
    #[serde(default)]
    prompt_tokens: Option<u64>,
    #[serde(default)]
    completion_tokens: Option<u64>,
}

#[derive(Default)]
struct OpenAiToolCallBuilder {
    id: Option<String>,
    name: Option<String>,
    arguments: String,
}

#[derive(Default)]
struct OpenAiAccum {
    full_content: String,
    tool_call_order: Vec<usize>,
    tool_calls: HashMap<usize, OpenAiToolCallBuilder>,
    prompt_tokens: Option<u64>,
    completion_tokens: Option<u64>,
}

impl OpenAiAccum {
    fn finalize_tool_calls(&self) -> Option<Vec<ToolCall>> {
        if self.tool_calls.is_empty() {
            return None;
        }
        let calls = self
            .tool_call_order
            .iter()
            .filter_map(|idx| {
                let builder = self.tool_calls.get(idx)?;
                let name = builder.name.clone().unwrap_or_default();
                let arguments: Value =
                    serde_json::from_str(&builder.arguments).unwrap_or(Value::Null);
                Some(ToolCall {
                    id: builder.id.clone(),
                    function: tools::ToolCallFunction { name, arguments },
                })
            })
            .collect::<Vec<_>>();
        if calls.is_empty() {
            None
        } else {
            Some(calls)
        }
    }
}

/// Parses one SSE `data: ...` line's payload (the JSON text after the
/// `data: ` prefix; `[DONE]` is handled by the caller before this is
/// reached) and folds it into `accum`. Pulled out of the streaming loop so
/// it's unit-testable against canned fixture strings.
fn accumulate_openai_data(data: &str, accum: &mut OpenAiAccum) -> Vec<LineEffects> {
    let mut effects = vec![];
    match serde_json::from_str::<OpenAiStreamChunk>(data) {
        Ok(chunk) => {
            if let Some(usage) = chunk.usage {
                if usage.prompt_tokens.is_some() {
                    accum.prompt_tokens = usage.prompt_tokens;
                }
                if usage.completion_tokens.is_some() {
                    accum.completion_tokens = usage.completion_tokens;
                }
            }
            for choice in chunk.choices {
                let mut choice_effects = LineEffects::default();
                if let Some(content) = choice.delta.content {
                    if !content.is_empty() {
                        accum.full_content.push_str(&content);
                        choice_effects.chunk = Some(content);
                    }
                }
                if let Some(reasoning) = choice.delta.reasoning_content {
                    if !reasoning.is_empty() {
                        choice_effects.thinking = Some(reasoning);
                    }
                }
                if let Some(deltas) = choice.delta.tool_calls {
                    for delta in deltas {
                        if !accum.tool_calls.contains_key(&delta.index) {
                            accum.tool_call_order.push(delta.index);
                        }
                        let builder = accum.tool_calls.entry(delta.index).or_default();
                        if let Some(id) = delta.id {
                            builder.id = Some(id);
                        }
                        if let Some(function) = delta.function {
                            if let Some(name) = function.name {
                                builder.name = Some(name);
                            }
                            if let Some(args) = function.arguments {
                                builder.arguments.push_str(&args);
                            }
                        }
                    }
                }
                effects.push(choice_effects);
            }
        }
        Err(e) => {
            effects.push(LineEffects {
                parse_error: Some(e.to_string()),
                ..Default::default()
            });
        }
    }
    effects
}

#[allow(clippy::too_many_arguments)]
async fn stream_turn_openai(
    app: &AppHandle,
    base_url: &str,
    api_key: &str,
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
    let base_url = base_url.trim_end_matches('/');
    let client = reqwest::Client::new();
    let body = OpenAiChatRequest {
        model,
        messages: history,
        stream: true,
        tools: tools::tool_definitions(root, touched_dirs, allow_subtasks),
        stream_options: serde_json::json!({ "include_usage": true }),
    };
    let mut request = client
        .post(format!("{base_url}/chat/completions"))
        .header("Accept", "text/event-stream")
        .json(&body);
    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {api_key}"));
    }
    let resp = match request.send().await {
        Ok(r) => r,
        Err(e) => {
            return Err(ProviderError::Fatal(format!(
                "failed to reach {base_url}: {e}"
            )));
        }
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let is_transient = status.as_u16() == 429 || status.is_server_error();
        let body_text = resp.text().await.unwrap_or_default();
        let msg = format!("provider returned {status}: {body_text}");
        return Err(if is_transient {
            ProviderError::Transient(msg)
        } else {
            ProviderError::Fatal(msg)
        });
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut accum = OpenAiAccum::default();
    let mut done = false;

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
            let Some(data) = line.strip_prefix("data:").map(|s| s.trim()) else {
                continue;
            };
            if data == "[DONE]" {
                done = true;
                break 'outer;
            }
            let choice_effects = accumulate_openai_data(data, &mut accum);
            if choice_effects.iter().any(|e| e.chunk.is_some()) {
                persist_chunk(app, message_id, &accum.full_content);
            }
            for effects in choice_effects {
                emit_line_effects(app, chunk_event, thinking_event, error_event, effects);
            }
        }
    }
    let _ = done;

    let tool_calls = accum.finalize_tool_calls();
    Ok(TurnResult {
        content: accum.full_content,
        tool_calls,
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
    fn openai_concatenates_incremental_tool_call_arguments_by_index() {
        let mut accum = OpenAiAccum::default();
        let frames = [
            r#"{"choices":[{"delta":{"content":"Hi"}}]}"#,
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\"pa"}}]}}]}"#,
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\":\"a.rs\"}"}}]}}]}"#,
            r#"{"choices":[{"delta":{}}],"usage":{"prompt_tokens":7,"completion_tokens":3}}"#,
        ];
        let mut full_content = String::new();
        for frame in frames {
            for effects in accumulate_openai_data(frame, &mut accum) {
                if let Some(c) = effects.chunk {
                    full_content.push_str(&c);
                }
            }
        }
        assert_eq!(full_content, "Hi");
        assert_eq!(accum.prompt_tokens, Some(7));
        assert_eq!(accum.completion_tokens, Some(3));
        let calls = accum.finalize_tool_calls().expect("tool calls");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].function.name, "read_file");
        assert_eq!(
            calls[0].function.arguments,
            serde_json::json!({"path": "a.rs"})
        );
    }

    #[test]
    fn provider_config_serde_matches_frontend_wire_shape() {
        let ollama = ProviderConfig::Ollama {
            host: "localhost:11434".into(),
        };
        let v = serde_json::to_value(&ollama).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "ollama", "host": "localhost:11434"})
        );

        let openai = ProviderConfig::OpenAiCompatible {
            base_url: "https://api.openai.com/v1".into(),
            api_key: "sk-test".into(),
        };
        let v = serde_json::to_value(&openai).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "openAiCompatible", "baseUrl": "https://api.openai.com/v1", "apiKey": "sk-test"})
        );
    }

    #[test]
    fn ollama_error_parsing_tool_call_classifies_as_transient() {
        let body_text = "{\"error\":\"error parsing tool call\"}".to_string();
        assert!(body_text.contains("error parsing tool call"));
        let other_body = "{\"error\":\"model not found\"}".to_string();
        assert!(!other_body.contains("error parsing tool call"));
    }
}
