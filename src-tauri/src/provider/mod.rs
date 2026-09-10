mod ollama;
mod openai_compat;

use crate::chat::{ChatMessage, TurnResult};
use crate::db;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

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
        ProviderConfig::Ollama { host } => ollama::list_ollama_models(&host).await,
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
        ProviderConfig::Ollama { host } => ollama::list_ollama_models(&host).await.is_ok(),
        ProviderConfig::OpenAiCompatible { base_url, api_key } => {
            openai_compat::check_openai_compatible_connection(&base_url, &api_key).await
        }
    }
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
        ProviderConfig::Ollama { host } => ollama::complete_ollama(host, model, messages).await,
        ProviderConfig::OpenAiCompatible { base_url, api_key } => {
            openai_compat::complete_openai(base_url, api_key, model, messages).await
        }
    }
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
            ollama::stream_turn_ollama(
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
            openai_compat::stream_turn_openai(
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
/// Shared by both streaming implementations below.
fn persist_chunk(app: &AppHandle, message_id: Option<i64>, full_content: &str) {
    if let Some(id) = message_id {
        let state = app.state::<AppState>();
        db::update_streaming_message(&state.db, id, full_content);
    }
}

/// What a parsed line wants emitted — kept separate from the actual
/// `app.emit(...)` calls so the parsing/accumulation logic is pure and
/// unit-testable without a real `AppHandle`. Shared by both streaming
/// implementations below (Ollama's NDJSON and the OpenAI-compatible SSE
/// parser each produce this same shape).
#[derive(Default)]
struct LineEffects {
    chunk: Option<String>,
    thinking: Option<String>,
    parse_error: Option<String>,
}

fn emit_line_effects(
    app: &AppHandle,
    chunk_event: &str,
    thinking_event: &str,
    error_event: &str,
    effects: LineEffects,
) {
    use tauri::Emitter;
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
