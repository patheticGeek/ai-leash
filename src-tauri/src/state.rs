use crate::acp::AcpCommand;
use crate::actions::ActionRun;
use crate::chat::ChatMessage;
use crate::db::Db;
use crate::mcp_bridge::McpBridgeInfo;
use crate::provider::ProviderConfig;
use crate::pty::PtyHandle;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::sync::oneshot;
use tokio::sync::Mutex as AsyncMutex;

#[derive(Clone)]
pub struct AcpSession {
    pub launch_command: String,
    pub sender: mpsc::UnboundedSender<AcpCommand>,
    /// The native provider/model this conversation is currently configured
    /// with — refreshed on every `send_prompt_acp` call, same as
    /// `launch_command`. Needed so a `spawn_sub_agent` call relayed through
    /// `mcp_bridge` (arriving from the ACP subprocess asynchronously, with
    /// no frontend-invoked command call site to attach a fresh
    /// provider/model argument to) has something to run the sub-agent with.
    pub provider: ProviderConfig,
    pub model: String,
}

#[derive(Default)]
pub struct AppState {
    pub project_root: Mutex<Option<PathBuf>>,
    pub ptys: Mutex<HashMap<String, PtyHandle>>,
    pub chat_sessions: Mutex<HashMap<String, Vec<ChatMessage>>>,
    pub pending_permissions: Mutex<HashMap<String, oneshot::Sender<bool>>>,
    pub cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
    /// Directories each session's agent has touched via its tools (read_file,
    /// edit_file, write_file, list_dir, grep), used to scope AGENTS.md/skills
    /// discovery to subfolders the agent is actually working in.
    pub touched_dirs: Mutex<HashMap<String, HashSet<PathBuf>>>,
    /// One async lock per session, held for the duration of any turn (user-
    /// initiated or a background subtask's autonomous resume) so the two can
    /// never run concurrently and interleave writes to the same history.
    pub session_locks: Mutex<HashMap<String, Arc<AsyncMutex<()>>>>,
    /// The active filesystem watcher for the current project root, if any.
    /// Replacing it (opening a different folder) drops the old one, which
    /// stops it automatically.
    pub fs_watcher: Mutex<Option<notify::RecommendedWatcher>>,
    /// SQLite-backed conversation history — see `db.rs`.
    pub db: Db,
    /// One entry per session_id (a project's path) that currently has a live
    /// external ACP agent subprocess — the launch command it was started
    /// with (so a later call for the same session_id but a *different*
    /// agent, since agent choice is per-conversation, knows to replace it
    /// instead of silently reusing the old agent's process) and the channel
    /// used to send it prompts/cancellations. See `acp.rs::ensure_acp_session`.
    pub acp_sessions: Mutex<HashMap<String, AcpSession>>,
    /// Loopback bridge external ACP agent subprocesses relay a handful of
    /// tool calls through — see `mcp_bridge`. Bound once at startup
    /// (`lib.rs`'s `.setup()` hook); `None` only in the brief window before
    /// that finishes.
    pub mcp_bridge: Mutex<Option<McpBridgeInfo>>,
    /// Sessions currently in "bypass" permission mode — `request_permission`
    /// (tools.rs) auto-approves instead of prompting for any session_id in
    /// here. Set via the `set_permission_mode` command, which the frontend
    /// calls from the Ask/Bypass selector next to the model picker
    /// (`ChatPanel.tsx`). A sub-agent inherits its parent's membership at
    /// spawn time (see `spawn_sub_agent` in tools.rs) since it shares the
    /// parent's cancellation flag the same way.
    pub permission_bypass: Mutex<HashSet<String>>,
    /// Live/most-recent run per Action, keyed by the Action's stable `id`
    /// (not its pty id) — see `actions.rs`. Persisted Action *definitions*
    /// live in `.ai-leash/actions.json` under the project root, not here.
    pub action_runs: Mutex<HashMap<String, ActionRun>>,
}
