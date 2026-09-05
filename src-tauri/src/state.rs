use crate::chat::ChatMessage;
use crate::pty::PtyHandle;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    pub project_root: Mutex<Option<PathBuf>>,
    pub ptys: Mutex<HashMap<String, PtyHandle>>,
    pub chat_sessions: Mutex<HashMap<String, Vec<ChatMessage>>>,
}
