//! A native provider (Ollama, OpenAI-compatible) driven by our own agent
//! loop — `chat/agent_loop.rs` calls the provider's `ModelClient` turn by
//! turn and runs the tools itself.

use super::{Backend, BoxFuture, Capabilities, TaskResult};
use crate::chat;
use crate::provider::ProviderConfig;
use crate::state::AppState;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[derive(Clone)]
pub struct NativeBackend {
    pub provider: ProviderConfig,
    pub model: String,
    pub effort: Option<String>,
}

impl Backend for NativeBackend {
    fn capabilities(&self) -> Capabilities {
        self.provider.client().capabilities()
    }

    fn native(&self) -> &NativeBackend {
        self
    }

    fn send<'a>(
        &'a self,
        app: &'a AppHandle,
        session_id: &'a str,
        message: String,
    ) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async move {
            let state = app.state::<AppState>();
            chat::push_message(
                &state,
                session_id,
                chat::ChatMessage {
                    role: "user".into(),
                    content: message,
                    tool_calls: None,
                },
            );
            chat::run_turn(app, &state, session_id, self, false).await
        })
    }

    fn retry<'a>(
        &'a self,
        app: &'a AppHandle,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async move {
            let state = app.state::<AppState>();
            chat::retry(app, &state, session_id, self).await
        })
    }

    fn compact<'a>(
        &'a self,
        app: &'a AppHandle,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<String, String>> {
        Box::pin(async move {
            let state = app.state::<AppState>();
            chat::compact(&state, session_id, self).await
        })
    }

    fn run_task<'a>(
        &'a self,
        app: &'a AppHandle,
        parent_session_id: &'a str,
        sub_session_id: &'a str,
        prompt: &'a str,
        cancel_flag: &'a Arc<AtomicBool>,
    ) -> BoxFuture<'a, Result<String, String>> {
        Box::pin(async move {
            let state = app.state::<AppState>();
            chat::run_sub_agent(
                app,
                &state,
                parent_session_id,
                sub_session_id,
                prompt,
                self,
                cancel_flag,
            )
            .await
        })
    }

    fn deliver_task_result<'a>(
        &'a self,
        app: &'a AppHandle,
        session_id: &'a str,
        result: TaskResult,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            let state = app.state::<AppState>();
            chat::record_sub_agent_result(
                app,
                &state,
                session_id,
                &result.sub_session_id,
                &result.description,
                &result.result,
            );
            // Nobody typed this turn — the model reacting to the result on
            // its own — so it's `autonomous`, and a failure has already been
            // shown on the conversation's error event.
            let _ = chat::run_turn(app, &state, session_id, self, true).await;
        })
    }
}
