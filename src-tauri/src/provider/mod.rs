mod client;
mod ollama;
mod openai_compat;

pub use client::{BackendError, ModelClient, TurnRequest};

use crate::db;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

pub(crate) const EFFORT_LEVELS: &[&str] = &["low", "medium", "high"];

/// How to reach a native provider — built from a registry entry
/// (`backend::registry::BackendConfig`), never sent by the frontend.
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
    /// The one place a provider kind is branched on — everything else talks
    /// to the returned `ModelClient`.
    pub fn client(&self) -> Box<dyn ModelClient> {
        match self {
            ProviderConfig::Ollama { host } => {
                Box::new(ollama::OllamaClient { host: host.clone() })
            }
            ProviderConfig::OpenAiCompatible { base_url, api_key } => {
                Box::new(openai_compat::OpenAiCompatClient {
                    base_url: base_url.clone(),
                    api_key: api_key.clone(),
                })
            }
        }
    }

    fn ollama_base_url(host: &str) -> String {
        let host = if host.trim().is_empty() {
            "localhost:11434"
        } else {
            host.trim()
        };
        format!("http://{host}")
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSummary {
    pub name: String,
    pub context_length: Option<u64>,
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
