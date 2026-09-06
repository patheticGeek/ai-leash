use crate::chat::ChatMessage;
use crate::pty::PtyHandle;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

#[derive(Default)]
pub struct AppState {
    pub project_root: Mutex<Option<PathBuf>>,
    pub ptys: Mutex<HashMap<String, PtyHandle>>,
    pub chat_sessions: Mutex<HashMap<String, Vec<ChatMessage>>>,
    pub pending_permissions: Mutex<HashMap<String, oneshot::Sender<bool>>>,
    pub cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
}
