//! OpenAI-compatible: SSE (`data: {...}\n`, terminated by `data: [DONE]`),
//! tool-call arguments arrive as incremental string fragments keyed by index
//! and must be concatenated before parsing as JSON.

use super::client::{BackendError, ModelClient, TurnRequest};
use super::{emit_line_effects, persist_chunk, LineEffects, ModelSummary};
use crate::backend::{BoxFuture, Capabilities};
use crate::chat::{ChatMessage, TurnResult};
use crate::tools::{self, ToolCall};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::Ordering;

pub(super) struct OpenAiCompatClient {
    /// Full base URL, no `/chat/completions` suffix.
    pub base_url: String,
    /// Sent as a bearer token when non-empty.
    pub api_key: String,
}

impl ModelClient for OpenAiCompatClient {
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            // Many hosts don't implement `GET /models` reliably (or gate it
            // separately), and it has no context-length equivalent anyway —
            // the model id is free text for this provider kind.
            model_listing: false,
            owns_agent_loop: false,
            native_tools: true,
            thinking: true,
            resume: false,
            effort: true,
            compaction: true,
            retry: true,
            slash_commands: false,
        }
    }

    fn list_models(&self) -> BoxFuture<'_, Result<Vec<ModelSummary>, BackendError>> {
        Box::pin(async { Ok(vec![]) })
    }

    fn check_connection(&self) -> BoxFuture<'_, bool> {
        Box::pin(check_openai_compatible_connection(
            &self.base_url,
            &self.api_key,
        ))
    }

    fn complete<'a>(
        &'a self,
        model: &'a str,
        messages: &'a [ChatMessage],
    ) -> BoxFuture<'a, Result<String, BackendError>> {
        Box::pin(complete_openai(
            &self.base_url,
            &self.api_key,
            model,
            messages,
        ))
    }

    fn stream_turn<'a>(
        &'a self,
        request: TurnRequest<'a>,
    ) -> BoxFuture<'a, Result<TurnResult, BackendError>> {
        Box::pin(stream_turn_openai(&self.base_url, &self.api_key, request))
    }
}

/// A 5xx from a hosted API is usually a momentary outage worth retrying.
const RETRY_SERVER_ERRORS: bool = true;

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

async fn complete_openai(
    base_url: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
) -> Result<String, BackendError> {
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
        .map_err(|e| BackendError::Unreachable(format!("failed to reach {base_url}: {e}")))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(BackendError::from_status(
            status,
            format!("provider returned {status}: {body_text}"),
            false,
            RETRY_SERVER_ERRORS,
        ));
    }
    let value: Value = resp
        .json()
        .await
        .map_err(|e| BackendError::Fatal(e.to_string()))?;
    value
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .map(str::to_string)
        .ok_or_else(|| BackendError::Fatal("provider response had no message content".to_string()))
}

#[derive(Serialize)]
struct OpenAiChatRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    stream: bool,
    tools: Value,
    stream_options: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning_effort: Option<&'a str>,
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

async fn stream_turn_openai(
    base_url: &str,
    api_key: &str,
    request: TurnRequest<'_>,
) -> Result<TurnResult, BackendError> {
    let TurnRequest {
        app,
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
        effort,
    } = request;
    let base_url = base_url.trim_end_matches('/');
    let client = reqwest::Client::new();
    let body = OpenAiChatRequest {
        model,
        messages: history,
        stream: true,
        tools: tools::tool_definitions(root, touched_dirs, allow_subtasks),
        stream_options: serde_json::json!({ "include_usage": true }),
        reasoning_effort: effort,
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
            return Err(BackendError::Unreachable(format!(
                "failed to reach {base_url}: {e}"
            )));
        }
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        let msg = format!("provider returned {status}: {body_text}");
        return Err(BackendError::from_status(
            status,
            msg,
            false,
            RETRY_SERVER_ERRORS,
        ));
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
            Err(e) => return Err(BackendError::Fatal(e.to_string())),
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
}
