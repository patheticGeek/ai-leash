use crate::db;
use crate::state::{AppState, ConversationRoot};
use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub const IGNORED_NAMES: &[&str] = &[".git", "node_modules", "target", "dist"];

pub fn resolve_within_root(root: &Path, requested: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(requested);
    let joined = if candidate.is_absolute() {
        candidate
    } else {
        root.join(candidate)
    };
    let root_canonical = root.canonicalize().map_err(|e| e.to_string())?;
    let canonical = if joined.exists() {
        joined.canonicalize().map_err(|e| e.to_string())?
    } else {
        let parent = joined.parent().ok_or("invalid path")?;
        let parent_canonical = parent.canonicalize().map_err(|e| e.to_string())?;
        parent_canonical.join(joined.file_name().ok_or("invalid path")?)
    };
    if !canonical.starts_with(&root_canonical) {
        return Err("path escapes project root".into());
    }
    Ok(canonical)
}

pub fn get_root_path(state: &AppState) -> Result<PathBuf, String> {
    state
        .project_root
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "no project open".to_string())
}

/// A sub-agent's session_id is `{parent_session_id}::spawn_sub_agent::{uuid}`
/// (see `tools::sub_agent_tools`) — sub-agents are capped one level deep, so
/// a single split recovers the owning top-level conversation id, which is
/// what `conversation_roots` is actually keyed by.
fn top_level_session_id(session_id: &str) -> &str {
    session_id
        .split("::spawn_sub_agent::")
        .next()
        .unwrap_or(session_id)
}

pub struct ConversationRootInfo {
    /// Where the agent's tools/shell/ACP subprocess actually run — the
    /// conversation's worktree if it has one, else the primary checkout.
    pub cwd: PathBuf,
    /// The primary repo root, regardless of `cwd` — used for project
    /// identity/grouping (`conversations.project_root`), never for the
    /// agent's actual working directory.
    pub project_root: PathBuf,
}

/// Resolves `session_id`'s own checkout, falling back to the single global
/// `project_root` (with no worktree) for sessions that never called
/// `set_conversation_root` — conversations from before this feature existed,
/// until they're next opened, or any caller that isn't conversation-scoped.
pub fn get_conversation_root(
    state: &AppState,
    session_id: &str,
) -> Result<ConversationRootInfo, String> {
    let key = top_level_session_id(session_id);
    if let Some(root) = state.conversation_roots.lock().unwrap().get(key) {
        return Ok(ConversationRootInfo {
            cwd: root.cwd.clone(),
            project_root: root.project_root.clone(),
        });
    }
    let root = get_root_path(state)?;
    Ok(ConversationRootInfo {
        cwd: root.clone(),
        project_root: root,
    })
}

/// Convenience for the common case (tool execution, ACP subprocess cwd):
/// just the effective working directory, not the full identity info.
pub fn get_session_root(state: &AppState, session_id: &str) -> Result<PathBuf, String> {
    Ok(get_conversation_root(state, session_id)?.cwd)
}

/// Locks in `session_id`'s checkout — called once right after a conversation
/// is created (as the primary checkout by default, before `ChatPanel` can
/// warm an ACP subprocess against the wrong cwd), again whenever a worktree
/// is picked for it (at any point in its lifetime — see `git.rs`'s
/// `checkout_git_branch` doc comment on why switching is always safe), or an
/// already-started conversation is reopened (restoring whatever was
/// persisted). Idempotent: only drops an already-warmed ACP subprocess for
/// this session if `cwd` is *actually* changing — reopening a conversation
/// that's already generating in the background must not kill that live
/// connection just because it was reopened with its own, unchanged,
/// already-correct root.
///
/// Only `worktree_path` is ever persisted (`cwd` when it differs from
/// `project_root`, else `None`) — never a branch name, which can drift out
/// from under the app at any time (see `git.rs`'s module doc). Skips the DB
/// write entirely for a still-fresh conversation defaulting to its primary
/// checkout (no row exists yet and there's no worktree to remember), so
/// picking a project for a new thread doesn't leave a stray empty
/// conversation behind if the user never actually sends a message.
///
/// Also (re)points the file-tree/editor watcher at `cwd` — see
/// `start_fs_watcher`'s doc comment. Every call site represents this
/// conversation becoming (or staying) the one currently shown, so this is
/// unconditional, not gated behind the ACP-session `changed` check below:
/// reopening an already-focused conversation with its own unchanged root
/// still means "the file tree should be looking at this cwd right now."
#[tauri::command]
pub fn set_conversation_root(
    app: AppHandle,
    state: State<AppState>,
    session_id: String,
    project_root: String,
    cwd: String,
) -> Result<(), String> {
    let cwd_path = PathBuf::from(&cwd);
    if !cwd_path.is_dir() {
        return Err("not a directory".into());
    }
    start_fs_watcher(app, &state, &cwd_path)?;
    let project_root_path = PathBuf::from(&project_root);
    let mut roots = state.conversation_roots.lock().unwrap();
    let changed = roots.get(&session_id).is_some_and(|r| r.cwd != cwd_path);
    roots.insert(
        session_id.clone(),
        ConversationRoot {
            project_root: project_root_path,
            cwd: cwd_path,
        },
    );
    drop(roots);
    if changed {
        state.acp_sessions.lock().unwrap().remove(&session_id);
    }
    let worktree_path = (cwd != project_root).then_some(cwd.as_str());
    if worktree_path.is_some() || db::conversation_exists(&state.db, &session_id) {
        db::set_conversation_worktree(&state.db, &session_id, &project_root, worktree_path);
    }
    Ok(())
}

/// Returns the project's stable UUID (`db::ensure_project`'s return value)
/// so the frontend can show/compare a real project identity instead of only
/// having the filesystem path — see `projectSlice.ts`'s `projectId`.
#[tauri::command]
pub fn set_project_root(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("not a directory".into());
    }
    // Keep the selected path shape unchanged for the existing frontend
    // session keys; path normalization is a separate project-management step.
    let root = p;
    let root_string = root.display().to_string();
    let project_id = db::ensure_project(&state.db, &root_string);
    db::touch_project(&state.db, &root_string);
    *state.project_root.lock().unwrap() = Some(root);

    // First root of the process is the earliest point ACP catalog discovery
    // has anything to connect with — see `AppState.acp_catalog_refresh_started`'s
    // doc comment for why this, not `lib.rs`'s `.setup()` hook, is where the
    // background refresh gets kicked off.
    if !state
        .acp_catalog_refresh_started
        .swap(true, std::sync::atomic::Ordering::SeqCst)
    {
        tauri::async_runtime::spawn(crate::acp::refresh_acp_catalog_in_background(app));
    }
    Ok(project_id)
}

/// Watches a checkout recursively and tells the frontend to refresh the
/// file tree whenever anything changes underneath it — file edits from the
/// agent's tools, `git checkout`/builds run in the terminal, or changes made
/// outside the app entirely. Events are debounced (batched over a short
/// window) so a burst of changes (e.g. a build writing many files) triggers
/// one refresh instead of a flood of them, and carry the *directories* whose
/// listings actually changed (each event's own path's parent — a listing
/// changes when an entry is added/removed/renamed underneath it, not at the
/// entry's own path) as the event payload, so the frontend can invalidate
/// just those cached directory listings instead of every open one across
/// every project. Replacing `state.fs_watcher` (on the next call — see
/// `set_conversation_root`, the sole caller: it always runs right after
/// `set_project_root` when a conversation becomes active, pointed at that
/// conversation's own cwd rather than the plain project root) drops the old
/// watcher and its background thread exits on its own once the channel
/// closes.
fn start_fs_watcher(app: AppHandle, state: &State<AppState>, root: &Path) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel::<Vec<PathBuf>>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let _ = tx.send(event.paths);
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    *state.fs_watcher.lock().unwrap() = Some(watcher);

    std::thread::spawn(move || {
        const DEBOUNCE: Duration = Duration::from_millis(300);
        while let Ok(first) = rx.recv() {
            let mut changed_dirs: HashSet<String> = HashSet::new();
            let mut collect = |paths: Vec<PathBuf>| {
                for path in paths {
                    let dir = path.parent().unwrap_or(&path);
                    changed_dirs.insert(dir.display().to_string());
                }
            };
            collect(first);
            let deadline = Instant::now() + DEBOUNCE;
            while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
                if remaining.is_zero() {
                    break;
                }
                match rx.recv_timeout(remaining) {
                    Ok(paths) => collect(paths),
                    Err(_) => break,
                }
            }
            let dirs: Vec<String> = changed_dirs.into_iter().collect();
            if app.emit("fs://changed", dirs).is_err() {
                break;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn get_project_root(state: State<AppState>) -> Option<String> {
    state
        .project_root
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.display().to_string())
}

/// Takes the checkout path directly rather than a session id — like
/// Actions (see `actions.rs`'s module doc), the file tree is scoped to the
/// checkout itself, not to any particular conversation pinned to it, and
/// the frontend's `useQuery` cache key is (and must be) this same path.
#[tauri::command]
pub fn list_dir(checkout_path: String, path: Option<String>) -> Result<Vec<DirEntryInfo>, String> {
    let root = PathBuf::from(checkout_path);
    let target = match path {
        Some(p) => resolve_within_root(&root, &p)?,
        None => root.clone(),
    };

    let mut entries = vec![];
    for entry in std::fs::read_dir(&target).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if IGNORED_NAMES.contains(&name.as_str()) {
            continue;
        }
        let entry_path = entry.path();
        entries.push(DirEntryInfo {
            name,
            path: entry_path.display().to_string(),
            is_dir: entry_path.is_dir(),
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub fn read_file_text(
    state: State<AppState>,
    session_id: String,
    path: String,
) -> Result<String, String> {
    let root = get_session_root(state.inner(), &session_id)?;
    let resolved = resolve_within_root(&root, &path)?;
    std::fs::read_to_string(resolved).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file_text(
    state: State<AppState>,
    session_id: String,
    path: String,
    contents: String,
) -> Result<(), String> {
    let root = get_session_root(state.inner(), &session_id)?;
    let resolved = resolve_within_root(&root, &path)?;
    std::fs::write(resolved, contents).map_err(|e| e.to_string())
}

/// Launches the user's configured IDE command (`code`, `zed`, `code -n`, ...)
/// on a project/worktree directory. The command string is shell-split so
/// flags work, but never run through a shell — the path is appended as one
/// literal argument. IDE launcher CLIs normally hand off to the running (or
/// a freshly started) GUI and exit within moments, so this waits briefly to
/// surface a failed launch (missing binary, non-zero exit + stderr); one
/// that's still running after the grace period is assumed to *be* the IDE
/// and is left running, reaped by a background thread.
#[tauri::command]
pub async fn open_in_ide(command: String, path: String) -> Result<(), String> {
    let mut parts = shlex::split(&command)
        .ok_or_else(|| "IDE command has unbalanced quotes".to_string())?
        .into_iter();
    let program = parts
        .next()
        .ok_or_else(|| "no IDE command configured".to_string())?;
    let mut child = std::process::Command::new(&program)
        .args(parts)
        .arg(&path)
        .current_dir(&path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run `{program}`: {e}"))?;

    tauri::async_runtime::spawn_blocking(move || {
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            match child.try_wait() {
                Ok(Some(status)) if status.success() => return Ok(()),
                Ok(Some(status)) => {
                    let mut stderr = String::new();
                    if let Some(mut pipe) = child.stderr.take() {
                        use std::io::Read;
                        let _ = pipe.read_to_string(&mut stderr);
                    }
                    let stderr = stderr.trim();
                    return Err(if stderr.is_empty() {
                        format!("`{program}` exited with {status}")
                    } else {
                        format!("`{program}` exited with {status}: {stderr}")
                    });
                }
                Ok(None) if Instant::now() >= deadline => {
                    // Drop the pipe so a chatty long-running IDE can't block
                    // on a full stderr buffer nobody reads.
                    drop(child.stderr.take());
                    std::thread::spawn(move || {
                        let _ = child.wait();
                    });
                    return Ok(());
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                Err(e) => return Err(e.to_string()),
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
