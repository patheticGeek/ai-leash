//! Git branch/worktree listing, creation, and checkout — shells out to the
//! system `git` binary rather than pulling in `git2`/`libgit2`, matching the
//! app's existing subprocess-based style (ACP agents, shell tool) instead of
//! adding a native dependency to the Tauri bundle. Worktree porcelain
//! (`git worktree add`) is also simpler to drive this way than through
//! libgit2's own worktree support.
//!
//! Branch is deliberately never persisted (see `db::set_conversation_worktree`
//! — only `worktree_path` is stored): whatever's checked out in a worktree
//! can change from outside the app (a manual `git checkout`, a rebase), so a
//! stored branch name would go stale. `watch_git_branch` instead watches the
//! relevant git dir for `HEAD` moving, live, so the frontend can always show
//! the true current branch.

use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

use crate::state::AppState;

fn run_git(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn list_branches(root: &Path) -> Result<Vec<String>, String> {
    let out = run_git(
        root,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
    )?;
    Ok(out
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect())
}

/// `None` for a detached HEAD (`--abbrev-ref` prints the literal `HEAD`).
fn current_branch(root: &Path) -> Result<Option<String>, String> {
    let branch = run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    Ok((branch != "HEAD").then_some(branch))
}

/// Flattens a branch name into a filesystem-safe leaf directory name —
/// branch names can contain `/` (e.g. `feature/foo`), which would otherwise
/// create nested directories under the `.worktrees` folder instead of one
/// leaf per worktree.
fn sanitize_branch_for_path(branch: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for c in branch.chars() {
        if c.is_ascii_alphanumeric() || c == '.' || c == '_' {
            out.push(c);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "branch".to_string()
    } else {
        trimmed.to_string()
    }
}

/// A sibling `<repo-folder-name>.worktrees/<sanitized branch name>` directory
/// next to `repo_root`, created if it doesn't exist yet. Shared by both
/// worktree-creation paths below.
fn worktree_target_path(repo_root: &Path, branch: &str) -> Result<PathBuf, String> {
    let folder_name = repo_root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("repo");
    let parent = repo_root
        .parent()
        .ok_or("repo root has no parent directory")?;
    let worktrees_dir = parent.join(format!("{folder_name}.worktrees"));
    std::fs::create_dir_all(&worktrees_dir).map_err(|e| e.to_string())?;
    let target = worktrees_dir.join(sanitize_branch_for_path(branch));
    if target.exists() {
        return Err(format!("{} already exists", target.display()));
    }
    Ok(target)
}

/// Creates a new branch (`new_branch`, off `base_branch`) plus a worktree
/// checked out to it. Returns the new worktree's absolute path.
fn create_worktree_new_branch(
    root: &Path,
    new_branch: &str,
    base_branch: &str,
) -> Result<PathBuf, String> {
    let repo_root = root.canonicalize().map_err(|e| e.to_string())?;
    let target = worktree_target_path(&repo_root, new_branch)?;
    run_git(
        &repo_root,
        &[
            "worktree",
            "add",
            "-b",
            new_branch,
            target.to_str().ok_or("invalid path")?,
            base_branch,
        ],
    )?;
    Ok(target)
}

/// Attaches a worktree to an existing branch that isn't checked out anywhere
/// else. Returns the new worktree's absolute path.
fn create_worktree_existing_branch(root: &Path, branch: &str) -> Result<PathBuf, String> {
    let repo_root = root.canonicalize().map_err(|e| e.to_string())?;
    let target = worktree_target_path(&repo_root, branch)?;
    run_git(
        &repo_root,
        &[
            "worktree",
            "add",
            target.to_str().ok_or("invalid path")?,
            branch,
        ],
    )?;
    Ok(target)
}

fn checkout_branch(worktree_path: &Path, branch: &str) -> Result<(), String> {
    run_git(worktree_path, &["checkout", branch]).map(|_| ())
}

fn checkout_new_branch(
    worktree_path: &Path,
    new_branch: &str,
    base_branch: &str,
) -> Result<(), String> {
    run_git(worktree_path, &["checkout", "-b", new_branch, base_branch]).map(|_| ())
}

/// The directory holding `root`'s `HEAD` — for the primary checkout this is
/// `<repo>/.git`, but for a linked worktree `git` keeps its own `HEAD` under
/// the main repo's `.git/worktrees/<name>/` instead, which `--git-dir`
/// resolves correctly either way.
fn git_dir(root: &Path) -> Result<PathBuf, String> {
    let dir = run_git(root, &["rev-parse", "--git-dir"])?;
    let dir = PathBuf::from(dir);
    Ok(if dir.is_absolute() {
        dir
    } else {
        root.join(dir)
    })
}

/// Whether a watcher event on a git dir is `HEAD` actually moving. `git
/// checkout` never edits `HEAD` in place — it writes `HEAD.lock` and renames
/// it over `HEAD` — so the events to look for are creates/renames/writes
/// touching either name. Reads (`Access`) are excluded: refetching the
/// branch runs `git`, which reads `HEAD`, so counting them would loop.
fn is_head_change(event: &notify::Event) -> bool {
    !matches!(event.kind, notify::EventKind::Access(_))
        && event.paths.iter().any(|p| {
            matches!(
                p.file_name().and_then(|n| n.to_str()),
                Some("HEAD" | "HEAD.lock")
            )
        })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub is_primary: bool,
}

/// Local branches only (`refs/heads/`) — remotes aren't offered as a base
/// branch. Takes an explicit `root_path` (a worktree's own path, not
/// necessarily the primary checkout) rather than reading the app's global
/// project root, since the branch bar operates on whichever worktree is
/// currently selected.
#[tauri::command]
pub fn list_git_branches(root_path: String) -> Result<Vec<GitBranch>, String> {
    let root = PathBuf::from(root_path);
    let current = current_branch(&root)?;
    Ok(list_branches(&root)?
        .into_iter()
        .map(|name| {
            let is_current = current.as_deref() == Some(name.as_str());
            GitBranch { name, is_current }
        })
        .collect())
}

/// Every worktree for the repo containing `root_path` — the primary
/// checkout first (`git worktree list` always lists it first), then each
/// linked worktree.
#[tauri::command]
pub fn list_git_worktrees(root_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let root = PathBuf::from(root_path);
    let out = run_git(&root, &["worktree", "list", "--porcelain"])?;
    let mut result: Vec<WorktreeInfo> = Vec::new();
    let mut path: Option<String> = None;
    let mut branch: Option<String> = None;
    for line in out.lines() {
        if let Some(p) = line.strip_prefix("worktree ") {
            if let Some(path) = path.take() {
                result.push(WorktreeInfo {
                    path,
                    branch: branch.take(),
                    is_primary: false,
                });
            }
            path = Some(p.to_string());
        } else if let Some(b) = line.strip_prefix("branch ") {
            branch = Some(b.trim_start_matches("refs/heads/").to_string());
        } else if line == "detached" {
            branch = None;
        }
    }
    if let Some(path) = path {
        result.push(WorktreeInfo {
            path,
            branch,
            is_primary: false,
        });
    }
    if let Some(first) = result.first_mut() {
        first.is_primary = true;
    }
    Ok(result)
}

#[tauri::command]
pub fn get_current_git_branch(root_path: String) -> Result<Option<String>, String> {
    current_branch(&PathBuf::from(root_path))
}

/// `base_branch: None` attaches the worktree to an existing branch;
/// `Some(base)` creates `branch` fresh off `base` instead.
#[tauri::command]
pub fn create_git_worktree(
    root_path: String,
    branch: String,
    base_branch: Option<String>,
) -> Result<String, String> {
    let root = PathBuf::from(root_path);
    let path = match base_branch {
        Some(base) => create_worktree_new_branch(&root, &branch, &base)?,
        None => create_worktree_existing_branch(&root, &branch)?,
    };
    Ok(path.display().to_string())
}

/// Switches what's checked out in `worktree_path` — a plain checkout of an
/// existing `branch` (`base_branch: None`), or creating `branch` fresh off
/// `base_branch` first. Independent of which worktree a conversation is
/// pinned to (see `commands::set_conversation_root`): this changes what's
/// on disk at that path, not the path itself, so it's safe to call at any
/// point in a conversation's lifetime, not just before its first message.
#[tauri::command]
pub fn checkout_git_branch(
    worktree_path: String,
    branch: String,
    base_branch: Option<String>,
) -> Result<(), String> {
    let path = PathBuf::from(worktree_path);
    match base_branch {
        Some(base) => checkout_new_branch(&path, &branch, &base),
        None => checkout_branch(&path, &branch),
    }
}

/// Removes a linked worktree and, unless still referenced elsewhere, the
/// directory `git worktree add` created for it. `force` maps straight to
/// `git worktree remove --force`, needed when the worktree has uncommitted
/// changes or untracked files — the plain form refuses in that case so a
/// caller can warn before retrying with `force: true`. Never called on the
/// primary checkout; the frontend excludes it from the delete affordance.
#[tauri::command]
pub fn delete_git_worktree(
    state: State<AppState>,
    root_path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), String> {
    let root = PathBuf::from(root_path);
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(&worktree_path);
    run_git(&root, &args)?;
    // Its git dir is gone, so the watcher on it is dead — drop it so a
    // worktree later recreated at the same path gets a fresh one.
    state
        .git_watchers
        .lock()
        .unwrap()
        .remove(&PathBuf::from(worktree_path));
    Ok(())
}

/// Deletes a local branch. `force` maps to `-D` instead of `-d`, needed when
/// the branch has unmerged commits — the safe form refuses in that case so a
/// caller can warn before retrying with `force: true`. `git` itself refuses
/// to delete the currently checked-out branch or one attached to another
/// worktree, so no extra guard is needed here.
#[tauri::command]
pub fn delete_git_branch(root_path: String, branch: String, force: bool) -> Result<(), String> {
    let root = PathBuf::from(root_path);
    run_git(&root, &["branch", if force { "-D" } else { "-d" }, &branch]).map(|_| ())
}

/// Starts watching `root_path`'s git dir (see `git_dir`) for `HEAD` moving and
/// emits `git://branch_changed` (payload: `root_path`, verbatim) on every
/// change, debounced the same way `commands::start_fs_watcher` is — a
/// `git checkout`/rebase/branch switch touches `HEAD` in a quick burst of
/// writes, not just one. Watches the directory, not the `HEAD` file: git
/// replaces the file on every switch, and a watch on the old file dies with
/// it. A no-op if this path is already being watched, so the frontend can
/// call it freely (every mount of a branch picker, and once per known
/// project/worktree at startup).
#[tauri::command]
pub fn watch_git_branch(
    app: AppHandle,
    state: State<AppState>,
    root_path: String,
) -> Result<(), String> {
    let root = PathBuf::from(&root_path);
    if state.git_watchers.lock().unwrap().contains_key(&root) {
        return Ok(());
    }
    let dir = git_dir(&root)?;
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok_and(|event| is_head_change(&event)) {
            let _ = tx.send(());
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    let mut watchers = state.git_watchers.lock().unwrap();
    // Another call for the same path may have won the race since the check
    // above — keep its watcher, drop ours.
    if watchers.contains_key(&root) {
        return Ok(());
    }
    watchers.insert(root, watcher);
    drop(watchers);

    std::thread::spawn(move || {
        const DEBOUNCE: Duration = Duration::from_millis(300);
        while rx.recv().is_ok() {
            let deadline = Instant::now() + DEBOUNCE;
            while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
                if remaining.is_zero() || rx.recv_timeout(remaining).is_err() {
                    break;
                }
            }
            if app.emit("git://branch_changed", &root_path).is_err() {
                break;
            }
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::{Event, EventKind};

    fn event(kind: EventKind, path: &str) -> Event {
        Event::new(kind).add_path(PathBuf::from(path))
    }

    #[test]
    fn head_and_its_lock_file_count_as_head_moving() {
        let modify = EventKind::Modify(notify::event::ModifyKind::Any);
        assert!(is_head_change(&event(modify, "/r/.git/HEAD")));
        assert!(is_head_change(&event(modify, "/r/.git/HEAD.lock")));
        assert!(!is_head_change(&event(modify, "/r/.git/index")));
        assert!(!is_head_change(&event(modify, "/r/.git/ORIG_HEAD")));
    }

    #[test]
    fn reads_of_head_are_ignored() {
        let read = EventKind::Access(notify::event::AccessKind::Any);
        assert!(!is_head_change(&event(read, "/r/.git/HEAD")));
    }

    /// The regression this module's watcher exists for: switching branches
    /// replaces `HEAD` (lock file + rename), and every switch — not just
    /// the first — must still be seen.
    #[test]
    fn repeated_branch_switches_are_each_observed() {
        let root = std::env::temp_dir().join(format!("ai-leash-git-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        for args in [
            &["init", "-q"][..],
            &[
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                // A developer's global signing config would otherwise pop a
                // pinentry prompt and hang the test.
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "init",
            ],
        ] {
            run_git(&root, args).unwrap();
        }

        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            if res.is_ok_and(|e| is_head_change(&e)) {
                let _ = tx.send(());
            }
        })
        .unwrap();
        watcher
            .watch(&git_dir(&root).unwrap(), RecursiveMode::NonRecursive)
            .unwrap();

        for branch in ["one", "two", "three"] {
            while rx.try_recv().is_ok() {}
            run_git(&root, &["checkout", "-q", "-b", branch]).unwrap();
            assert!(
                rx.recv_timeout(Duration::from_secs(3)).is_ok(),
                "no event for switch to `{branch}`"
            );
        }
        let _ = std::fs::remove_dir_all(&root);
    }
}
