//! Starting and finishing a board task.
//!
//! Starting gives the task its own chat: in a git project, on a fresh
//! `task/<number>-<slug>` branch in its own worktree; otherwise in the
//! project's one checkout (one task at a time there, unless the project
//! allows more — `db::parallel_main_checkout_tasks`). The chat is an
//! ordinary top-level conversation linked from `tasks.conversation_id`, and
//! its first message is the task itself.
//!
//! Finishing (moving it to Done) removes that worktree — the branch stays —
//! after checking nothing would be lost with it.

use super::{emit_board_changed, emit_board_changed_for};
use crate::backend::registry;
use crate::chat::history::emit_conversation_changed;
use crate::db::{self, AgentDefaults, Task};
use crate::git::{self, WorktreeChanges};
use crate::state::{AppState, ConversationRoot};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

/// How to start a task. Everything is optional; what's left out comes from
/// the task's own agent defaults, then the board's (see `resolve_agent`),
/// then the app's default backend with the model last used on it and (for
/// our own providers) a reasoning effort from the task's size.
#[derive(Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    pub backend_id: Option<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub agent_mode: Option<String>,
    /// Run its tools without asking (AI Leash's own Bypass mode).
    pub bypass_permissions: Option<bool>,
    /// Started by the project chat, so the task reports back to it — see
    /// `Task::engaged_with_project`.
    #[serde(default)]
    pub engaged_with_project: bool,
}

/// The agent a task starts with, before the app-wide fallbacks: `explicit`
/// (the Start dialog, or `start_task`'s arguments) over the task's own
/// defaults over the board's. A model, thinking level and agent mode
/// belong to a backend, so they're taken only from the layer that chose
/// the backend — unless no layer chose one, when each comes from wherever
/// it's set first. Permission isn't tied to a backend: first one set wins.
fn resolve_agent(
    explicit: &AgentDefaults,
    task: &AgentDefaults,
    board: &AgentDefaults,
) -> AgentDefaults {
    let first = |pick: fn(&AgentDefaults) -> &Option<String>| -> Option<String> {
        [explicit, task, board]
            .into_iter()
            .find_map(|layer| pick(layer).clone())
    };
    let permission_mode = first(|l| &l.permission_mode);
    if explicit.backend_id.is_some() {
        return AgentDefaults {
            permission_mode,
            ..explicit.clone()
        };
    }
    let chooser = [task, board].into_iter().find(|l| l.backend_id.is_some());
    let from_chooser = |pick: fn(&AgentDefaults) -> &Option<String>| -> Option<String> {
        pick(explicit).clone().or_else(|| match chooser {
            Some(layer) => pick(layer).clone(),
            None => first(pick),
        })
    };
    AgentDefaults {
        backend_id: chooser.and_then(|l| l.backend_id.clone()),
        model: from_chooser(|l| &l.model),
        thinking: from_chooser(|l| &l.thinking),
        agent_mode: from_chooser(|l| &l.agent_mode),
        permission_mode,
    }
}

/// A native provider's reasoning effort for a task of this size.
fn effort_for_size(size: Option<&str>) -> Option<String> {
    match size? {
        "xs" | "s" => Some("low".into()),
        "m" => Some("medium".into()),
        "l" | "xl" => Some("high".into()),
        _ => None,
    }
}

/// `task/<number>-<a few words of the title>`.
fn task_branch(task: &Task) -> String {
    let mut slug = String::new();
    for c in task.title.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
        if slug.len() >= 40 {
            break;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        format!("task/{}", task.number)
    } else {
        format!("task/{}-{slug}", task.number)
    }
}

/// The task's first message.
fn task_prompt(task: &Task, epic: Option<&str>, branch: Option<&str>) -> String {
    let mut details = vec![format!("Priority: {}", task.priority)];
    if let Some(effort) = &task.effort {
        details.push(format!("Effort: {}", effort.to_uppercase()));
    }
    if let Some(epic) = epic {
        details.push(format!("Epic: {epic}"));
    }
    let mut prompt = format!(
        "Work on task #{} from this project's board: {}\n\n{}",
        task.number,
        task.title,
        details.join(" · ")
    );
    if !task.description.trim().is_empty() {
        prompt.push_str("\n\n");
        prompt.push_str(task.description.trim());
    }
    prompt.push_str("\n\n");
    prompt.push_str(&match branch {
        Some(branch) => format!(
            "You're in a git worktree of your own on branch `{branch}`; commit your work there."
        ),
        None => "You're in the project's main checkout.".to_string(),
    });
    prompt.push_str(
        "\n\nWhen you're done, move the task to review with `update_task` (status \"review\"), \
             then summarise what you changed and anything left for the reviewer.",
    );
    prompt
}

/// Starts `task_id`: its checkout, its chat, and its first turn (left
/// running in the background). Returns the chat's conversation id.
pub(crate) fn start(
    app: &AppHandle,
    task_id: &str,
    options: StartOptions,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let task = db::get_task(&state.db, task_id).ok_or("no such task")?;
    if task.status == "done" {
        return Err(format!(
            "Task #{} is done. Move it back to Todo to start it again.",
            task.number
        ));
    }
    if task.conversation_id.is_some() {
        return Err(format!(
            "Task #{} is already started — its chat is in the sidebar.",
            task.number
        ));
    }
    let project_root = db::project_root_for_id(&state.db, &task.project_id)
        .ok_or("this task's project is gone")?;
    let root = PathBuf::from(&project_root);

    let explicit = AgentDefaults {
        backend_id: options.backend_id.clone(),
        model: options.model.clone(),
        thinking: options.effort.clone(),
        agent_mode: options.agent_mode.clone(),
        permission_mode: options
            .bypass_permissions
            .map(|bypass| if bypass { "bypass" } else { "ask" }.to_string()),
    };
    let agent = resolve_agent(
        &explicit,
        &task.agent,
        &db::board_agent_defaults(&state.db, &project_root),
    );
    let (backend_id, model) = {
        let backends = state.backends.lock().unwrap();
        let (default_id, default_model) = backends.default_selection();
        let backend_id = agent.backend_id.clone().unwrap_or(default_id);
        let model = match &agent.model {
            Some(model) => model.clone(),
            None if backend_id == backends.default_backend_id => default_model,
            None => String::new(),
        };
        (backend_id, model)
    };
    let native = state.backends.lock().unwrap().is_native(&backend_id);
    let effort = agent.thinking.clone().or_else(|| {
        native
            .then(|| effort_for_size(task.effort.as_deref()))
            .flatten()
    });
    let bypass_permissions = agent.permission_mode.as_deref() == Some("bypass");
    // Fails before anything is created if the backend is gone or off.
    let backend = registry::resolve(
        &state,
        &backend_id,
        &model,
        effort.as_deref(),
        agent.agent_mode.as_deref(),
    )?;

    let (cwd, branch) = if git::is_git_repo(&root) {
        let branch = task_branch(&task);
        (git::create_task_worktree(&root, &branch)?, Some(branch))
    } else {
        let running = db::running_tasks(&state.db, &project_root, task_id);
        if !running.is_empty() && !db::parallel_main_checkout_tasks(&state.db, &project_root) {
            let numbers: Vec<String> = running.iter().map(|t| format!("#{}", t.number)).collect();
            return Err(format!(
                "{} already in progress in this project's only checkout (it isn't a git \
                 repository, so tasks can't get worktrees of their own). Finish it first, or \
                 allow parallel tasks in the board's settings.",
                numbers.join(", ")
            ));
        }
        (root.clone(), None)
    };

    let conversation_id = Uuid::new_v4().to_string();
    let worktree = branch.as_ref().map(|_| cwd.display().to_string());
    db::set_conversation_worktree(
        &state.db,
        &conversation_id,
        &project_root,
        worktree.as_deref(),
    );
    db::set_conversation_title(&state.db, &conversation_id, Some(&task.title));
    db::set_conversation_backend(
        &state.db,
        &conversation_id,
        &project_root,
        &backend_id,
        (!model.is_empty()).then_some(model.as_str()),
        effort.as_deref(),
        agent.agent_mode.as_deref(),
    );
    if bypass_permissions {
        state
            .permission_bypass
            .lock()
            .unwrap()
            .insert(conversation_id.clone());
        db::set_conversation_permission_mode(&state.db, &conversation_id, &project_root, "bypass");
    }
    state.conversation_roots.lock().unwrap().insert(
        conversation_id.clone(),
        ConversationRoot {
            project_root: root,
            cwd,
        },
    );
    db::set_task_conversation(
        &state.db,
        task_id,
        Some(&conversation_id),
        options.engaged_with_project,
    );
    let task = db::move_task(&state.db, task_id, "in_progress", None)?;
    emit_conversation_changed(app, &conversation_id, "created");
    emit_board_changed(app, &project_root, Some(task_id), "started");

    let epic = task
        .epic_id
        .as_deref()
        .and_then(|id| {
            db::list_epics(&state.db, &project_root)
                .into_iter()
                .find(|e| e.id == id)
        })
        .map(|e| e.title);
    let prompt = task_prompt(&task, epic.as_deref(), branch.as_deref());
    let app = app.clone();
    let id = conversation_id.clone();
    tauri::async_runtime::spawn(async move {
        let _ = app.emit(&format!("chat://{id}/user_message"), &prompt);
        // A failure shows on the conversation's own error event.
        let _ = backend.send(&app, &id, prompt).await;
    });
    Ok(conversation_id)
}

/// `finish`'s result: done, or what removing the worktree would lose.
#[derive(Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum FinishOutcome {
    Done {
        task: Box<Task>,
    },
    #[serde(rename_all = "camelCase")]
    NeedsConfirmation {
        changes: WorktreeChanges,
    },
}

/// Moves `task_id` to Done (before `before_task_id`, or at the end). If its
/// chat has a worktree, that's removed — unless it has uncommitted changes
/// or commits no other branch has, in which case nothing happens and those
/// come back for the caller to confirm (`force`). Its chat is stopped,
/// marked done, and moved to the primary checkout so it can still be read.
pub(crate) async fn finish(
    app: &AppHandle,
    task_id: &str,
    before_task_id: Option<&str>,
    force: bool,
) -> Result<FinishOutcome, String> {
    let state = app.state::<AppState>();
    let task = db::get_task(&state.db, task_id).ok_or("no such task")?;
    let project_root = db::project_root_for_id(&state.db, &task.project_id)
        .ok_or("this task's project is gone")?;
    let conversation = task.conversation_id.clone();
    let worktree = conversation
        .as_deref()
        .and_then(|id| db::conversation_worktree(&state.db, id))
        .map(PathBuf::from)
        .filter(|p| p.is_dir());

    if let Some(worktree) = &worktree {
        let changes = git::worktree_changes(worktree)?;
        if !changes.is_empty() && !force {
            return Ok(FinishOutcome::NeedsConfirmation { changes });
        }
    }
    if let Some(id) = &conversation {
        crate::chat::cancel_and_await_idle(&state, id).await;
        // Its ACP subprocess, if any, runs inside the worktree.
        crate::backend::disconnect(&state, id);
    }
    if let Some(worktree) = &worktree {
        git::remove_worktree(&state, &PathBuf::from(&project_root), worktree, true)?;
    }
    if let Some(id) = &conversation {
        if worktree.is_some() {
            db::set_conversation_worktree(&state.db, id, &project_root, None);
            state.conversation_roots.lock().unwrap().remove(id);
        }
        db::set_conversation_done(&state.db, id, true);
        emit_conversation_changed(app, id, "done");
    }
    let task = db::move_task(&state.db, task_id, "done", before_task_id)?;
    emit_board_changed_for(app, &state, &task.project_id, Some(task_id), "finished");
    Ok(FinishOutcome::Done {
        task: Box::new(task),
    })
}

#[tauri::command]
pub fn start_task(
    app: AppHandle,
    task_id: String,
    options: StartOptions,
) -> Result<String, String> {
    start(&app, &task_id, options)
}

#[tauri::command]
pub async fn finish_task(
    app: AppHandle,
    task_id: String,
    before_task_id: Option<String>,
    force: bool,
) -> Result<FinishOutcome, String> {
    finish(&app, &task_id, before_task_id.as_deref(), force).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(number: i64, title: &str) -> Task {
        Task {
            id: "t".into(),
            project_id: "p".into(),
            epic_id: None,
            number,
            title: title.into(),
            description: String::new(),
            status: "todo".into(),
            priority: "high".into(),
            effort: Some("m".into()),
            position: 1.0,
            conversation_id: None,
            engaged_with_project: false,
            created_at: 0,
            updated_at: 0,
            started_at: None,
            completed_at: None,
            agent: AgentDefaults::default(),
        }
    }

    #[test]
    fn branch_names_are_short_safe_slugs() {
        assert_eq!(
            task_branch(&task(12, "Fix the diff colours!")),
            "task/12-fix-the-diff-colours"
        );
        assert_eq!(task_branch(&task(3, "???")), "task/3");
        let long = task_branch(&task(1, &"word ".repeat(30)));
        assert!(long.len() <= "task/1-".len() + 40, "{long}");
        assert!(!long.ends_with('-'));
    }

    fn agent(
        backend: Option<&str>,
        model: Option<&str>,
        permission: Option<&str>,
    ) -> AgentDefaults {
        AgentDefaults {
            backend_id: backend.map(str::to_string),
            model: model.map(str::to_string),
            permission_mode: permission.map(str::to_string),
            ..Default::default()
        }
    }

    #[test]
    fn the_agent_comes_from_the_most_specific_layer_that_picks_one() {
        let none = AgentDefaults::default();
        let board = agent(Some("ollama"), Some("llama3"), Some("bypass"));
        let task = agent(Some("claude"), None, None);

        // The task picks its own backend, so the board's model doesn't
        // carry over; its permission does.
        let got = resolve_agent(&none, &task, &board);
        assert_eq!(got.backend_id.as_deref(), Some("claude"));
        assert_eq!(got.model, None);
        assert_eq!(got.permission_mode.as_deref(), Some("bypass"));

        // Nothing on the task: the board decides.
        let got = resolve_agent(&none, &none, &board);
        assert_eq!(got.model.as_deref(), Some("llama3"));

        // An explicit model without a backend applies to whichever backend
        // the defaults chose.
        let explicit = agent(None, Some("llama3.1"), Some("ask"));
        let got = resolve_agent(&explicit, &none, &board);
        assert_eq!(got.backend_id.as_deref(), Some("ollama"));
        assert_eq!(got.model.as_deref(), Some("llama3.1"));
        assert_eq!(got.permission_mode.as_deref(), Some("ask"));

        // An explicit backend replaces everything backend-specific.
        let explicit = agent(Some("copilot"), None, None);
        let got = resolve_agent(&explicit, &task, &board);
        assert_eq!(got.backend_id.as_deref(), Some("copilot"));
        assert_eq!(got.model, None);
        assert_eq!(got.permission_mode.as_deref(), Some("bypass"));

        // No backend anywhere: each part from wherever it's set.
        let task = agent(None, Some("m"), None);
        let got = resolve_agent(&none, &task, &agent(None, None, Some("bypass")));
        assert_eq!(got.backend_id, None);
        assert_eq!(got.model.as_deref(), Some("m"));
        assert_eq!(got.permission_mode.as_deref(), Some("bypass"));
    }

    #[test]
    fn effort_follows_size() {
        assert_eq!(effort_for_size(Some("xs")).as_deref(), Some("low"));
        assert_eq!(effort_for_size(Some("m")).as_deref(), Some("medium"));
        assert_eq!(effort_for_size(Some("xl")).as_deref(), Some("high"));
        assert_eq!(effort_for_size(None), None);
    }

    #[test]
    fn the_prompt_carries_the_task_and_where_to_work() {
        let mut t = task(7, "Add dark mode");
        t.description = "Use the existing tokens.".into();
        let prompt = task_prompt(&t, Some("Theming"), Some("task/7-add-dark-mode"));
        assert!(prompt.starts_with("Work on task #7 from this project's board: Add dark mode"));
        assert!(prompt.contains("Priority: high · Effort: M · Epic: Theming"));
        assert!(prompt.contains("Use the existing tokens."));
        assert!(prompt.contains("`task/7-add-dark-mode`"));
        assert!(task_prompt(&t, None, None).contains("main checkout"));
        assert!(prompt.contains("`update_task`"));
    }
}
