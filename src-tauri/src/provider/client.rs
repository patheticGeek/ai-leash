//! The `ModelClient` trait: one interface every model provider (Ollama,
//! OpenAI-compatible) implements for a single call — list models, one
//! completion, one streamed turn. Our own agent loop (`chat/agent_loop.rs`)
//! drives it; the conversation-level `crate::backend::Backend` sits above
//! it. Adding a provider means implementing this and returning it from
//! `ProviderConfig::client`; nothing in `chat/` changes.
//!
//! Methods return boxed futures rather than using `async fn`: the trait is
//! used as `dyn ModelClient`, and `async fn` in traits isn't object-safe.

use super::ModelSummary;
use crate::backend::{BoxFuture, Capabilities};
use crate::chat::{ChatMessage, TurnResult};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::AppHandle;

/// Why a call failed, normalized across providers so the agent loop decides
/// what to do from the kind, never from provider-specific error text.
#[derive(Debug)]
pub enum BackendError {
    /// A hiccup worth retrying the same turn (Ollama's "error parsing tool
    /// call", a 5xx from an OpenAI-compatible host).
    Transient(String),
    /// The provider is throttling us (HTTP 429). Retrying immediately won't
    /// help, so it's surfaced rather than retried.
    RateLimited(String),
    /// Credentials were rejected (HTTP 401/403).
    Auth(String),
    /// The provider couldn't be reached at all.
    Unreachable(String),
    /// Anything else not worth retrying.
    Fatal(String),
}

impl BackendError {
    /// The text shown to the user.
    pub fn message(&self) -> &str {
        match self {
            BackendError::Transient(m)
            | BackendError::RateLimited(m)
            | BackendError::Auth(m)
            | BackendError::Unreachable(m)
            | BackendError::Fatal(m) => m,
        }
    }

    /// Classifies a non-success HTTP response. The provider supplies the two
    /// things that differ between them: whether this body marks the error as
    /// retryable (`transient_body`), and whether a 5xx is worth retrying at
    /// all (an OpenAI-compatible host's usually is; Ollama's usually means
    /// the model failed to load).
    pub(super) fn from_status(
        status: reqwest::StatusCode,
        message: String,
        transient_body: bool,
        retry_server_errors: bool,
    ) -> Self {
        match status.as_u16() {
            _ if transient_body => BackendError::Transient(message),
            401 | 403 => BackendError::Auth(message),
            429 => BackendError::RateLimited(message),
            _ if retry_server_errors && status.is_server_error() => {
                BackendError::Transient(message)
            }
            _ => BackendError::Fatal(message),
        }
    }
}

/// Everything one streamed turn needs — bundled so the trait method stays
/// readable and adding a field doesn't touch every implementation's
/// signature.
pub struct TurnRequest<'a> {
    pub app: &'a AppHandle,
    pub model: &'a str,
    pub history: &'a [ChatMessage],
    pub chunk_event: &'a str,
    pub thinking_event: &'a str,
    pub error_event: &'a str,
    pub cancel_flag: &'a Arc<AtomicBool>,
    pub root: Option<&'a Path>,
    pub touched_dirs: &'a [PathBuf],
    pub allow_subtasks: bool,
    /// Row to flush streamed text into as it arrives; `None` when there's no
    /// project root to persist under.
    pub message_id: Option<i64>,
    pub effort: Option<&'a str>,
}

pub trait ModelClient: Send + Sync {
    fn capabilities(&self) -> Capabilities;

    /// Available models. Only meaningful when `capabilities().model_listing`.
    fn list_models(&self) -> BoxFuture<'_, Result<Vec<ModelSummary>, BackendError>>;

    /// Whether the provider answers at all — any HTTP response counts, even
    /// 401: this checks reachability, not credentials.
    fn check_connection(&self) -> BoxFuture<'_, bool>;

    /// One non-streaming, tool-free completion (`/compact`'s summary).
    fn complete<'a>(
        &'a self,
        model: &'a str,
        messages: &'a [ChatMessage],
    ) -> BoxFuture<'a, Result<String, BackendError>>;

    /// One streamed turn of the agent loop, emitting chunk/thinking events as
    /// it goes.
    fn stream_turn<'a>(
        &'a self,
        request: TurnRequest<'a>,
    ) -> BoxFuture<'a, Result<TurnResult, BackendError>>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::StatusCode;

    #[test]
    fn statuses_map_to_the_right_kind() {
        let kind = |code: u16, transient_body: bool, retry_5xx: bool| {
            BackendError::from_status(
                StatusCode::from_u16(code).unwrap(),
                String::new(),
                transient_body,
                retry_5xx,
            )
        };
        assert!(matches!(kind(401, false, true), BackendError::Auth(_)));
        assert!(matches!(kind(403, false, true), BackendError::Auth(_)));
        assert!(matches!(
            kind(429, false, true),
            BackendError::RateLimited(_)
        ));
        assert!(matches!(kind(503, false, true), BackendError::Transient(_)));
        assert!(matches!(kind(500, false, false), BackendError::Fatal(_)));
        assert!(matches!(kind(500, true, false), BackendError::Transient(_)));
        assert!(matches!(kind(400, false, true), BackendError::Fatal(_)));
    }
}
