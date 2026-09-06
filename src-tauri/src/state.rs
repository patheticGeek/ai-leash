use crate::chat::ChatMessage;
use crate::db::Db;
use crate::pty::PtyHandle;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use tokio::sync::Mutex as AsyncMutex;

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
}
