use crate::acp::AcpCommand;
use crate::actions::ActionRun;
use crate::chat::ChatMessage;
use crate::db::Db;
use crate::mcp_bridge::McpBridgeInfo;
use crate::provider::ProviderConfig;
use crate::pty::PtyHandle;
use agent_client_protocol::schema::v1::ElicitationAction;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::sync::oneshot;
use tokio::sync::Mutex as AsyncMutex;
use tokio::sync::Notify;

/// One open elicitation form: who asked (`session_id`) and where the user's
/// answer goes.
pub struct PendingElicitation {
    pub session_id: String,
    pub tx: oneshot::Sender<ElicitationAction>,
}

#[derive(Clone)]
pub struct AcpSession {
    pub launch_command: String,
    pub sender: mpsc::UnboundedSender<AcpCommand>,
    /// Set only while a `Prompt` is actually in flight on this connection —
    /// lets `cancel_prompt` interrupt it immediately instead of queuing a
    /// `Cancel` behind it in `sender`'s channel, which `drive_acp_connection`
    /// (`acp/process.rs`) can't drain until the in-flight prompt resolves on
    /// its own (an ACP `PromptRequest` typically spans the agent's *entire*
    /// turn, so that queued `Cancel` would arrive only once there's nothing
    /// left to cancel). `None` when idle, so a cancel signalled with nothing
    /// running stays the documented no-op. A fresh `Notify` per turn, rather
    /// than one long-lived instance, so a stray already-fired permit from a
    /// turn that just finished can't immediately fire again at the start of
    /// the next, unrelated one.
    pub current_prompt_cancel: Arc<Mutex<Option<Arc<Notify>>>>,
    /// The native provider/model this conversation is currently configured
    /// with — refreshed on every `send_prompt_acp` call, same as
    /// `launch_command`. Needed so a `spawn_sub_agent` call relayed through
    /// `mcp_bridge` (arriving from the ACP subprocess asynchronously, with
    /// no frontend-invoked command call site to attach a fresh
    /// provider/model argument to) has something to run the sub-agent with.
    pub provider: ProviderConfig,
    pub model: String,
    /// Last-emitted `chat://{session_id}/acp_model_options`,
    /// `.../acp_effort_options`, and `.../acp_commands` payloads, if any —
    /// each is normally only ever sent once (right after connecting, or
    /// when explicitly changed via `SetModel`/`SetEffort`), so a frontend
    /// that (re)subscribes after this connection already exists — e.g. the
    /// same conversation's `ChatPanel` remounting after switching away and
    /// back — would otherwise never learn them. `ensure_acp_session`
    /// re-emits these verbatim when reusing an already-running connection
    /// instead of spawning a fresh one. See `process.rs`/`events.rs` for
    /// where each is populated.
    pub model_options: Option<serde_json::Value>,
    pub effort_options: Option<serde_json::Value>,
    pub available_commands: Option<serde_json::Value>,
}

/// One configured ACP agent (id/label/launch command) plus whatever
/// model/effort options have been discovered for it. Written two ways:
/// wholesale via `acp::sync_acp_agent_catalog` whenever `acpSlice.ts`'s
/// `agentBackend.acpAgents` changes (on-demand discovery of a new/edited
/// agent, still frontend-triggered), and by Rust's own
/// `acp::refresh_acp_catalog_in_background` re-running discovery for
/// already-known agents once per launch. Persisted to disk
/// (`acp::acp_catalog_path`) so it survives a restart and is loaded back
/// into this field synchronously in `lib.rs`'s `.setup()` hook, before the
/// frontend has even booted — this cache is what lets backend tool calls
/// (`list_agent_options`, `spawn_sub_agent`'s `agent` argument) look up an
/// ACP agent by name and its selectable models/effort levels without paying
/// for a fresh discovery connection on every call.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpAgentCatalogEntry {
    pub id: String,
    pub label: String,
    pub launch_command: String,
    pub model_options: Option<serde_json::Value>,
    pub effort_options: Option<serde_json::Value>,
}

/// A conversation's own effective checkout — set via
/// `commands::set_conversation_root` once the conversation is created (as
/// the primary checkout by default) or a worktree is picked for it. `cwd` is
/// what the agent's tools/shell/ACP subprocess actually run in; `project_root`
/// stays the primary repo root regardless, so a worktree conversation is
/// still grouped under the same project rather than fragmenting into its own
/// entry in `projects`/`recentProjects`.
#[derive(Clone)]
pub struct ConversationRoot {
    pub project_root: PathBuf,
    pub cwd: PathBuf,
}

#[derive(Default)]
pub struct AppState {
    pub project_root: Mutex<Option<PathBuf>>,
    /// Per-conversation working directory, keyed by top-level session_id —
    /// see `commands::get_conversation_root`/`set_conversation_root`. Absent
    /// for a session that never called `set_conversation_root` (any
    /// conversation from before this feature existed, until it's reopened),
    /// in which case callers fall back to the single global `project_root`
    /// above, same as before this map existed.
    pub conversation_roots: Mutex<HashMap<String, ConversationRoot>>,
    pub ptys: Mutex<HashMap<String, PtyHandle>>,
    pub chat_sessions: Mutex<HashMap<String, Vec<ChatMessage>>>,
    pub pending_permissions: Mutex<HashMap<String, oneshot::Sender<bool>>>,
    /// Open ACP `elicitation/create` forms, keyed by request id — see
    /// `acp::elicitation`. Carries the owning session so a cancelled turn or
    /// a closed connection can dismiss just its own forms.
    pub pending_elicitations: Mutex<HashMap<String, PendingElicitation>>,
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
    /// One `HEAD`-file watcher per worktree path currently being observed by
    /// a `BranchBar` — see `git::watch_git_branch`. Unlike `fs_watcher`,
    /// several of these can be live at once (one per open conversation's
    /// worktree), so this is a map rather than a single slot.
    pub git_watchers: Mutex<HashMap<PathBuf, notify::RecommendedWatcher>>,
    /// SQLite-backed conversation history — see `db.rs`.
    pub db: Db,
    /// One entry per session_id (a project's path) that currently has a live
    /// external ACP agent subprocess — the launch command it was started
    /// with (so a later call for the same session_id but a *different*
    /// agent, since agent choice is per-conversation, knows to replace it
    /// instead of silently reusing the old agent's process) and the channel
    /// used to send it prompts/cancellations. See `acp.rs::ensure_acp_session`.
    pub acp_sessions: Mutex<HashMap<String, AcpSession>>,
    /// See `AcpAgentCatalogEntry`'s doc comment.
    pub acp_agent_catalog: Mutex<Vec<AcpAgentCatalogEntry>>,
    /// Guards `acp::refresh_acp_catalog_in_background` so it only ever runs
    /// once per process — claimed via `swap(true, ...)` the first time
    /// `commands::set_project_root` is called (the earliest point a project
    /// root, and therefore a valid ACP discovery target, exists). A later
    /// project switch shouldn't re-trigger it: an agent's models are a
    /// property of its binary, not of whichever project happens to be open.
    pub acp_catalog_refresh_started: AtomicBool,
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
    /// Live/most-recent run per Action, keyed by (the checkout it ran in,
    /// the Action's stable `id` — not its pty id) — see `actions.rs::run_key`.
    /// The checkout is part of the key, not just the id, because
    /// `.ai-leash/actions.json` is a real tracked file: two worktrees of the
    /// same project can each have their own copy (same ids, until one
    /// diverges), and a run started in one must never show as running for a
    /// conversation pinned to the other. Persisted Action *definitions* live
    /// in `.ai-leash/actions.json` under whichever checkout, not here.
    pub action_runs: Mutex<HashMap<(String, String), ActionRun>>,
}
