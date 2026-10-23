//! The project board as tools, so an agent can plan and track work by
//! chatting: list, read, create and update tasks, start them, and manage
//! epics. Offered to every conversation, natively and over the MCP bridge.
//!
//! Tasks are named the way people name them — `#12` — and a task's own chat
//! can leave the task out entirely: `update_task` and `read_task` default to
//! the task the calling conversation was started for.

use crate::board::{emit_board_changed, lifecycle, messaging};
use crate::commands;
use crate::db::{self, AgentDefaults, Epic, NewEpic, NewTask, Task, TaskPatch};
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

pub(crate) fn board_defs() -> Vec<Value> {
    let status = json!({ "type": "string", "enum": db::TASK_STATUSES });
    let priority = json!({ "type": "string", "enum": db::TASK_PRIORITIES });
    let mut sizes: Vec<Value> = db::TASK_EFFORTS.iter().map(|e| json!(e)).collect();
    sizes.push(Value::Null);
    let effort = json!({
        "type": ["string", "null"],
        "enum": sizes,
        "description": "T-shirt size of the work; null clears it"
    });
    vec![
        json!({
            "name": "list_tasks",
            "description": "List the tasks on this project's board (its Kanban board), one line each: number, status, priority, effort, epic, title, and whether its chat is working. Done tasks are left out unless `include_done` is set.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": status.clone(),
                    "epic": { "type": "string", "description": "Only tasks in this epic (its title)" },
                    "include_done": { "type": "boolean" }
                },
                "required": []
            }
        }),
        json!({
            "name": "read_task",
            "description": "Read one task in full: description, status, priority, effort, epic, and its chat. Omit `task` to read the task this conversation was started for.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task": { "type": "string", "description": "The task's number, e.g. \"#12\"" }
                },
                "required": []
            }
        }),
        json!({
            "name": "create_tasks",
            "description": "Add one or more tasks to this project's board. Use it to break work down into tasks the user can see, prioritise and start. New tasks go to Todo unless `status` says otherwise. Each can name the agent, model, thinking and permission its chat starts with; leave them out to use the board's defaults.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tasks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": { "type": "string", "description": "Short, imperative: what needs doing" },
                                "description": { "type": "string", "description": "Markdown: context, acceptance criteria, pointers into the code" },
                                "status": status.clone(),
                                "priority": priority.clone(),
                                "effort": { "type": "string", "enum": db::TASK_EFFORTS, "description": "T-shirt size of the work" },
                                "agent": { "type": "string", "description": "Which agent its chat starts with: a backend's id or label from list_agent_options. Omit to use the board's default" },
                                "model": { "type": "string", "description": "A model id that agent offers" },
                                "thinking": { "type": "string", "description": "A reasoning effort that agent offers" },
                                "permission": { "type": "string", "enum": ["ask", "bypass"], "description": "Whether its tools ask before running (ask) or not (bypass)" },
                                "agent_mode": { "type": "string", "description": "For agents with their own modes: one of those modes" },
                                "epic": { "type": "string", "description": "Epic title to group it under; created if it doesn't exist yet" }
                            },
                            "required": ["title"]
                        }
                    }
                },
                "required": ["tasks"]
            }
        }),
        json!({
            "name": "update_task",
            "description": "Change a task: any of its title, description, status, priority, effort or epic. Omit `task` to update the task this conversation was started for — e.g. set status \"review\" when your work on it is finished. Setting status \"done\" removes the task's worktree, so it fails if that has uncommitted changes or unmerged commits; leave Done to the user unless they asked.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task": { "type": "string", "description": "The task's number, e.g. \"#12\"" },
                    "title": { "type": "string" },
                    "description": { "type": "string" },
                    "status": status,
                    "priority": priority,
                    "effort": effort,
                    "epic": { "type": ["string", "null"], "description": "Epic title (created if new); null removes it from its epic" },
                    "agent": { "type": "string", "description": "Which agent its chat starts with (backend id or label). Giving any of agent/model/thinking/permission/agent_mode replaces all of them" },
                    "model": { "type": "string" },
                    "thinking": { "type": "string", "description": "Reasoning effort" },
                    "permission": { "type": "string", "enum": ["ask", "bypass"] },
                    "agent_mode": { "type": "string" }
                },
                "required": []
            }
        }),
        json!({
            "name": "start_task",
            "description": "Start a task: it gets a chat of its own (in a new git worktree, in a git project) which immediately starts working on it, and moves to In progress. Its updates come back to you. Call list_agent_options first if you want a specific agent, model or effort; by default it uses the default agent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task": { "type": "string", "description": "The task's number, e.g. \"#12\"" },
                    "agent": { "type": "string", "description": "Which agent runs it: a backend's id or label from list_agent_options" },
                    "model": { "type": "string", "description": "A model id that agent offers" },
                    "effort": { "type": "string", "description": "A reasoning effort that agent offers" }
                },
                "required": ["task"]
            }
        }),
        json!({
            "name": "send_message",
            "description": "Message the project chat or a task's chat. From a task's chat, send to \"project\" to report progress or ask for something you need; it's woken up to answer if it's following this task, otherwise it sees your message as a note next time it runs. From the project chat (or any chat), send to a started task by number (\"#12\") to give it instructions or answer it; that task is woken up to act on it and its reply comes back. Don't also repeat what you send in your own reply.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": { "type": "string", "description": "\"project\" for the project chat, or a task's number, e.g. \"#12\"" },
                    "message": { "type": "string", "description": "What to tell them, self-contained" }
                },
                "required": ["to", "message"]
            }
        }),
        json!({
            "name": "list_epics",
            "description": "List this project's epics (groups of related tasks) with how many open tasks each has.",
            "parameters": { "type": "object", "properties": {}, "required": [] }
        }),
        json!({
            "name": "create_epic",
            "description": "Add an epic: a group of related tasks on this project's board.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "description": { "type": "string" }
                },
                "required": ["title"]
            }
        }),
    ]
}

/// Every tool name `execute` handles.
pub(crate) const BOARD_TOOLS: &[&str] = &[
    "list_tasks",
    "read_task",
    "create_tasks",
    "update_task",
    "start_task",
    "send_message",
    "list_epics",
    "create_epic",
];

fn project_root(state: &AppState, session_id: &str) -> Result<String, String> {
    let root = commands::get_conversation_root(state, session_id)?.project_root;
    Ok(root.display().to_string())
}

fn str_arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str)
}

/// `args.task`, or the calling conversation's own task.
fn resolve_task(
    state: &AppState,
    session_id: &str,
    root: &str,
    args: &Value,
) -> Result<Task, String> {
    match str_arg(args, "task") {
        Some(reference) => db::find_task(&state.db, root, reference)
            .ok_or_else(|| format!("No task `{reference}` on this board; list_tasks shows them.")),
        None => {
            let own = commands::top_level_session_id(state, session_id);
            db::task_for_conversation(&state.db, &own).ok_or_else(|| {
                "This conversation isn't a task's chat, so say which task (e.g. \"#12\").".into()
            })
        }
    }
}

/// An epic by title, created when it doesn't exist yet.
fn epic_named(app: &AppHandle, state: &AppState, root: &str, title: &str) -> Result<Epic, String> {
    if let Some(epic) = db::find_epic(&state.db, root, title) {
        return Ok(epic);
    }
    let epic = db::create_epic(
        &state.db,
        root,
        NewEpic {
            title: title.to_string(),
            ..Default::default()
        },
    )?;
    emit_board_changed(app, root, None, "epic");
    Ok(epic)
}

fn epic_title(epics: &[Epic], id: Option<&str>) -> Option<String> {
    let id = id?;
    epics.iter().find(|e| e.id == id).map(|e| e.title.clone())
}

fn is_working(state: &AppState, task: &Task) -> bool {
    task.conversation_id
        .as_deref()
        .is_some_and(|id| crate::chat::is_generating(state, id))
}

/// One line per task: `#12 [in_progress] high · M · Epic — Title (working)`.
fn task_line(state: &AppState, task: &Task, epics: &[Epic]) -> String {
    let mut details = vec![task.priority.clone()];
    if let Some(effort) = &task.effort {
        details.push(effort.to_uppercase());
    }
    if let Some(epic) = epic_title(epics, task.epic_id.as_deref()) {
        details.push(epic);
    }
    let chat = if is_working(state, task) {
        " (working)"
    } else if task.conversation_id.is_some() {
        " (has a chat)"
    } else {
        ""
    };
    format!(
        "#{} [{}] {} — {}{chat}",
        task.number,
        task.status,
        details.join(" · "),
        task.title
    )
}

fn list_tasks(state: &AppState, root: &str, args: &Value) -> Result<String, String> {
    let include_done = args
        .get("include_done")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let epics = db::list_epics(&state.db, root);
    let epic = match str_arg(args, "epic") {
        Some(title) => Some(
            db::find_epic(&state.db, root, title)
                .ok_or_else(|| format!("No epic `{title}`; list_epics shows them."))?,
        ),
        None => None,
    };
    let status = str_arg(args, "status");
    let mut tasks: Vec<Task> = db::list_tasks(&state.db, root, None)
        .into_iter()
        .filter(|t| status.is_none_or(|s| t.status == s))
        .filter(|t| include_done || status == Some("done") || t.status != "done")
        .filter(|t| {
            epic.as_ref()
                .is_none_or(|e| t.epic_id.as_deref() == Some(&e.id))
        })
        .collect();
    let order = |s: &str| db::TASK_STATUSES.iter().position(|x| *x == s);
    tasks.sort_by(|a, b| {
        order(&a.status)
            .cmp(&order(&b.status))
            .then(a.position.total_cmp(&b.position))
    });
    if tasks.is_empty() {
        return Ok("No tasks match.".into());
    }
    Ok(tasks
        .iter()
        .map(|t| task_line(state, t, &epics))
        .collect::<Vec<_>>()
        .join("\n"))
}

fn read_task(
    state: &AppState,
    session_id: &str,
    root: &str,
    args: &Value,
) -> Result<String, String> {
    let task = resolve_task(state, session_id, root, args)?;
    let epics = db::list_epics(&state.db, root);
    let mut out = format!(
        "#{} {}\nStatus: {}\nPriority: {}\nEffort: {}\nEpic: {}\n",
        task.number,
        task.title,
        task.status,
        task.priority,
        task.effort
            .as_deref()
            .map_or("unsized".into(), str::to_uppercase),
        epic_title(&epics, task.epic_id.as_deref()).unwrap_or_else(|| "none".into()),
    );
    let agent = &task.agent;
    if !agent.is_empty() {
        let parts: Vec<String> = [
            agent.backend_id.as_deref().map(|b| format!("agent {b}")),
            agent.model.as_deref().map(|m| format!("model {m}")),
            agent.thinking.as_deref().map(|t| format!("thinking {t}")),
            agent
                .permission_mode
                .as_deref()
                .map(|p| format!("permission {p}")),
            agent.agent_mode.as_deref().map(|m| format!("mode {m}")),
        ]
        .into_iter()
        .flatten()
        .collect();
        out.push_str(&format!("Starts with: {}\n", parts.join(", ")));
    }
    out.push_str(match (&task.conversation_id, is_working(state, &task)) {
        (Some(_), true) => "Chat: working\n",
        (Some(_), false) => "Chat: idle\n",
        (None, _) => "Chat: not started\n",
    });
    if !task.description.trim().is_empty() {
        out.push('\n');
        out.push_str(task.description.trim());
    }
    Ok(out)
}

/// A backend's id from what an agent named it by: its id or its label.
fn backend_named(state: &AppState, agent: &str) -> Result<String, String> {
    let backends = state.backends.lock().unwrap();
    backends
        .backends
        .iter()
        .find(|b| b.id == agent || b.label.eq_ignore_ascii_case(agent))
        .map(|b| b.id.clone())
        .ok_or_else(|| format!("No agent `{agent}`; list_agent_options shows the configured ones."))
}

/// The agent a task's chat should start with, from `create_tasks`/
/// `update_task` arguments — `None` if none of them were given.
fn agent_args(state: &AppState, args: &Value) -> Result<Option<AgentDefaults>, String> {
    let keys = ["agent", "model", "thinking", "permission", "agent_mode"];
    if !keys.iter().any(|k| args.get(k).is_some()) {
        return Ok(None);
    }
    Ok(Some(AgentDefaults {
        backend_id: str_arg(args, "agent")
            .map(|a| backend_named(state, a))
            .transpose()?,
        model: str_arg(args, "model").map(str::to_string),
        thinking: str_arg(args, "thinking").map(str::to_string),
        permission_mode: str_arg(args, "permission").map(str::to_string),
        agent_mode: str_arg(args, "agent_mode").map(str::to_string),
    }))
}

fn create_tasks(
    app: &AppHandle,
    state: &AppState,
    root: &str,
    args: &Value,
) -> Result<String, String> {
    let items = args
        .get("tasks")
        .and_then(Value::as_array)
        .filter(|a| !a.is_empty())
        .ok_or("`tasks` must be a non-empty array")?;
    let mut created = Vec::new();
    for item in items {
        let epic_id = match str_arg(item, "epic") {
            Some(title) => Some(epic_named(app, state, root, title)?.id),
            None => None,
        };
        let task = db::create_task(
            &state.db,
            root,
            NewTask {
                title: str_arg(item, "title").unwrap_or_default().to_string(),
                description: str_arg(item, "description").unwrap_or_default().to_string(),
                status: str_arg(item, "status").map(str::to_string),
                priority: str_arg(item, "priority").map(str::to_string),
                effort: str_arg(item, "effort").map(str::to_string),
                epic_id,
                agent: agent_args(state, item)?.unwrap_or_default(),
            },
        )?;
        emit_board_changed(app, root, Some(&task.id), "created");
        created.push(format!("#{} {}", task.number, task.title));
    }
    Ok(format!("Created:\n{}", created.join("\n")))
}

async fn update_task(
    app: &AppHandle,
    state: &AppState,
    session_id: &str,
    root: &str,
    args: &Value,
) -> Result<String, String> {
    let task = resolve_task(state, session_id, root, args)?;
    let epic_id = match args.get("epic") {
        None => None,
        Some(Value::Null) => Some(None),
        Some(Value::String(title)) => Some(Some(epic_named(app, state, root, title)?.id)),
        Some(_) => return Err("`epic` must be an epic title or null".into()),
    };
    let effort = match args.get("effort") {
        None => None,
        Some(Value::Null) => Some(None),
        Some(Value::String(size)) => Some(Some(size.clone())),
        Some(_) => return Err("`effort` must be a size or null".into()),
    };
    let status = str_arg(args, "status");
    // Done goes through finishing, which removes the worktree.
    let to_done = status == Some("done") && task.status != "done";
    let patch = TaskPatch {
        title: str_arg(args, "title").map(str::to_string),
        description: str_arg(args, "description").map(str::to_string),
        status: status.filter(|_| !to_done).map(str::to_string),
        priority: str_arg(args, "priority").map(str::to_string),
        effort,
        epic_id,
        agent: agent_args(state, args)?,
    };
    let mut task = db::update_task(&state.db, &task.id, patch)?;
    emit_board_changed(app, root, Some(&task.id), "updated");
    if to_done {
        match lifecycle::finish(app, &task.id, None, false).await? {
            lifecycle::FinishOutcome::Done { task: done } => task = *done,
            lifecycle::FinishOutcome::NeedsConfirmation { changes } => {
                let mut lines = changes.uncommitted;
                lines.extend(changes.unmerged_commits);
                return Err(format!(
                    "Didn't move #{} to Done: its worktree still has work that isn't merged \
                     anywhere, and Done removes the worktree. Commit and merge it, or ask the \
                     user to move it to Done themselves (they'll be asked to confirm).\n{}",
                    task.number,
                    lines.join("\n")
                ));
            }
        }
    }
    let epics = db::list_epics(&state.db, root);
    Ok(format!("Updated: {}", task_line(state, &task, &epics)))
}

fn start_task(
    app: &AppHandle,
    state: &AppState,
    session_id: &str,
    root: &str,
    args: &Value,
) -> Result<String, String> {
    let task = resolve_task(state, session_id, root, args)?;
    let backend_id = str_arg(args, "agent")
        .map(|a| backend_named(state, a))
        .transpose()?;
    let caller = commands::top_level_session_id(state, session_id);
    let from_project_chat = db::list_all_conversations(&state.db)
        .iter()
        .any(|c| c.id == caller && c.role.as_deref() == Some("project"));
    lifecycle::start(
        app,
        &task.id,
        lifecycle::StartOptions {
            backend_id,
            model: str_arg(args, "model").map(str::to_string),
            effort: str_arg(args, "effort").map(str::to_string),
            engaged_with_project: from_project_chat,
            ..Default::default()
        },
    )?;
    Ok(format!(
        "Started #{} {}: it has its own chat now and is working on it. You'll hear back when its turns end.",
        task.number, task.title
    ))
}

fn list_epics(state: &AppState, root: &str) -> Result<String, String> {
    let epics = db::list_epics(&state.db, root);
    if epics.is_empty() {
        return Ok("No epics yet.".into());
    }
    let tasks = db::list_tasks(&state.db, root, None);
    Ok(epics
        .iter()
        .map(|e| {
            let open = tasks
                .iter()
                .filter(|t| t.epic_id.as_deref() == Some(&e.id) && t.status != "done")
                .count();
            let archived = if e.archived { " (archived)" } else { "" };
            format!("{}{archived} — {open} open", e.title)
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

fn create_epic(
    app: &AppHandle,
    state: &AppState,
    root: &str,
    args: &Value,
) -> Result<String, String> {
    let epic = db::create_epic(
        &state.db,
        root,
        NewEpic {
            title: str_arg(args, "title").unwrap_or_default().to_string(),
            description: str_arg(args, "description").unwrap_or_default().to_string(),
            color: None,
        },
    )?;
    emit_board_changed(app, root, None, "epic");
    Ok(format!("Created epic {}.", epic.title))
}

pub(crate) async fn execute(
    app: &AppHandle,
    session_id: &str,
    name: &str,
    args: &Value,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let root = project_root(&state, session_id)?;
    match name {
        "list_tasks" => list_tasks(&state, &root, args),
        "read_task" => read_task(&state, session_id, &root, args),
        "create_tasks" => create_tasks(app, &state, &root, args),
        "update_task" => update_task(app, &state, session_id, &root, args).await,
        "start_task" => start_task(app, &state, session_id, &root, args),
        "send_message" => messaging::send_message(
            app,
            session_id,
            &root,
            str_arg(args, "to").ok_or("missing `to`")?,
            str_arg(args, "message").ok_or("missing `message`")?,
        ),
        "list_epics" => list_epics(&state, &root),
        "create_epic" => create_epic(app, &state, &root, args),
        other => Err(format!("unknown board tool `{other}`")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_definition_is_handled() {
        let names: Vec<String> = board_defs()
            .iter()
            .map(|d| d["name"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(names, BOARD_TOOLS);
    }
}
