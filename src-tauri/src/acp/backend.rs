//! An external ACP agent (Claude Code, Copilot CLI, …) as a `Backend`. It
//! runs its own agent loop in a subprocess; each conversation holds one
//! connection to it in `AppState::acp_sessions` (see `process.rs`).

use super::process::{ensure_acp_session, AcpCommand};
use super::rate_limit;
use crate::backend::{Backend, BoxFuture, Capabilities, NativeBackend, TaskResult};
use crate::chat::{self, ChatMessage};
use crate::db;
use crate::state::AppState;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::oneshot;

#[derive(Clone)]
pub struct AcpBackend {
    pub launch_command: String,
    /// The agent's own model/effort config values to select for a
    /// sub-agent's task, if `spawn_sub_agent` asked for them. A top-level
    /// conversation picks these live instead (`set_session_model`/`set_session_effort`).
    pub model_value: Option<String>,
    pub effort_value: Option<String>,
    /// See `Backend::native`.
    pub native: NativeBackend,
}

impl AcpBackend {
    fn connect(
        &self,
        app: &AppHandle,
        session_id: &str,
    ) -> tokio::sync::mpsc::UnboundedSender<AcpCommand> {
        let state = app.state::<AppState>();
        ensure_acp_session(
            app,
            &state,
            session_id,
            &self.launch_command,
            self.native.clone(),
        )
    }
}

impl Backend for AcpBackend {
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            model_listing: true,
            owns_agent_loop: true,
            native_tools: false,
            thinking: true,
            resume: true,
            effort: true,
            // Its context lives in the subprocess — nothing to compact from
            // out here; an agent's own `/compact` goes through as a prompt.
            compaction: false,
            retry: false,
            slash_commands: true,
        }
    }

    fn native(&self) -> &NativeBackend {
        &self.native
    }

    fn warm(&self, app: &AppHandle, session_id: &str) {
        self.connect(app, session_id);
        rate_limit::try_fire(app, session_id);
    }

    fn send<'a>(
        &'a self,
        app: &'a AppHandle,
        session_id: &'a str,
        message: String,
    ) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async move {
            self.connect(app, session_id)
                .send(AcpCommand::Prompt(message.clone(), None))
                .map_err(|_| {
                    "ACP agent process is no longer running; send another message to restart it."
                        .to_string()
                })?;
            // Persist at command acceptance time so title lookup and
            // transcript updates do not race the ACP worker's asynchronous
            // prompt handling.
            let state = app.state::<AppState>();
            chat::push_message(
                &state,
                session_id,
                ChatMessage {
                    role: "user".into(),
                    content: message,
                    tool_calls: None,
                },
            );
            rate_limit::clear(app, session_id);
            Ok(())
        })
    }

    /// Registers a fresh connection under the sub-agent's own
    /// `sub_session_id` (its own `chat://{sub_session_id}/...` stream for the
    /// Sub Agents tab, and Stop works through `acp::cancel`), sends at most
    /// one `SetModel`/`SetEffort` pair, then exactly one prompt, and awaits
    /// its resolution via the `oneshot` threaded through
    /// `AcpCommand::Prompt`. `cancel_flag` isn't polled: the agent runs the
    /// loop, so Stop reaches it as an ACP cancel instead.
    fn run_task<'a>(
        &'a self,
        app: &'a AppHandle,
        _parent_session_id: &'a str,
        sub_session_id: &'a str,
        prompt: &'a str,
        _cancel_flag: &'a Arc<AtomicBool>,
    ) -> BoxFuture<'a, Result<String, String>> {
        Box::pin(async move {
            let state = app.state::<AppState>();
            chat::push_message(
                &state,
                sub_session_id,
                ChatMessage {
                    role: "user".into(),
                    content: prompt.to_string(),
                    tool_calls: None,
                },
            );

            let sender = self.connect(app, sub_session_id);
            if let Some(value) = &self.model_value {
                let _ = sender.send(AcpCommand::SetModel(value.clone()));
            }
            if let Some(value) = &self.effort_value {
                let _ = sender.send(AcpCommand::SetEffort(value.clone()));
            }

            let (done_tx, done_rx) = oneshot::channel();
            sender
                .send(AcpCommand::Prompt(prompt.to_string(), Some(done_tx)))
                .map_err(|_| "ACP agent process is no longer running.".to_string())?;
            // Dropping this sender clone (the map's own clone goes with
            // `disconnect` below) is what lets the connection actor's
            // `commands.recv()` see the channel closed and exit, tearing the
            // subprocess down — see `ensure_acp_session`'s doc comment.
            drop(sender);

            let turn_result = done_rx
                .await
                .map_err(|_| "ACP sub-agent connection closed before finishing.".to_string())
                .and_then(|r| r);

            // A one-shot sub-agent's connection is never worth keeping warm
            // the way a top-level conversation's is — drop it as soon as its
            // single prompt resolves, regardless of outcome.
            crate::backend::disconnect(&state, sub_session_id);

            // A sub-agent's result is read as "its last message", so every
            // outcome leaves a real assistant message behind — same as the
            // native path (`chat::run_sub_agent`).
            if let Err(e) = &turn_result {
                chat::push_message(
                    &state,
                    sub_session_id,
                    ChatMessage {
                        role: "assistant".into(),
                        content: format!("Error: {e}"),
                        tool_calls: None,
                    },
                );
            }
            turn_result?;

            let final_text = db::load_messages(&state.db, sub_session_id)
                .into_iter()
                .rev()
                .find(|m| m.role == "assistant" && !m.content.trim().is_empty())
                .map(|m| m.content);
            Ok(match final_text {
                Some(text) => text,
                None => {
                    let text = "Subtask finished without a final response.".to_string();
                    chat::push_message(
                        &state,
                        sub_session_id,
                        ChatMessage {
                            role: "assistant".into(),
                            content: text.clone(),
                            tool_calls: None,
                        },
                    );
                    text
                }
            })
        })
    }

    /// The agent is a subprocess waiting on its own command channel, so the
    /// result reaches it the way a typed message does — as a plain-text
    /// prompt, since ACP can't inject a tool-call/result pair into the
    /// agent's own context. `record_sub_agent_result` gives our transcript
    /// the tool-call-shaped entry the native path gets, so the result shows
    /// as its own block before the agent's reaction streams in (otherwise
    /// the reaction is appended to the previous assistant bubble). If the
    /// connection was dropped meanwhile, this reconnects, like sending does.
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
            let _ = self.connect(app, session_id).send(AcpCommand::Prompt(
                format!(
                    "[Sub-agent \"{}\" finished]\n\n{}",
                    result.description, result.result
                ),
                None,
            ));
        })
    }
}
