//! Two-way messaging between a project's board chat and its task chats.
//!
//! Every delivery lands in the receiver's transcript, tagged with the
//! sending conversation (`messages.from_conversation_id`). It goes one of
//! two ways:
//!
//! - **Woken**: a user-role message the receiver answers with a turn of its
//!   own (`Backend::continue_turn`) — right away, or, if it's mid-turn,
//!   once that turn ends (`Mailroom::queued`, flushed by `on_turn_end`).
//! - **Note**: an `event` row it sees as context on its next turn, without
//!   one being started for it. Our own loop gets it in history; an ACP
//!   agent keeps its own, so it gets pending notes prepended to its next
//!   prompt (`with_pending_notes`).
//!
//! The project chat is only woken by tasks *engaged* with it
//! (`Task::engaged_with_project`): ones it started or messaged, until the
//! user writes in the task's own chat (`on_user_message`) — after that the
//! task's updates reach it as notes until it's engaged again. Messages to a
//! task always wake it. Whenever a task's turn ends, the project chat hears
//! about it (`on_turn_end`).
//!
//! Agents answering each other could go on forever, so once a chat has had
//! `MAX_AGENT_MESSAGES_IN_A_ROW` agent messages since a person last wrote
//! in it, further ones arrive as notes until someone does.

use super::emit_board_changed_for;
use crate::backend::registry;
use crate::chat::history::emit_conversation_changed;
use crate::chat::{self, ChatMessage};
use crate::commands;
use crate::db::{self, ConversationSummary};
use crate::state::{AppState, ConversationRoot};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub const MAX_AGENT_MESSAGES_IN_A_ROW: usize = 8;

/// How much of a task's last reply its update to the project chat quotes.
const REPLY_EXCERPT_CHARS: usize = 1500;

/// In-memory delivery state; lives in `AppState::mailroom`. Lost on exit:
/// a queued message is already in its sender's transcript as the tool call
/// that sent it.
#[derive(Default)]
pub struct Mailroom {
    /// Messages waiting for a busy conversation's turn to end.
    queued: Mutex<HashMap<String, Vec<Queued>>>,
    /// Notes an ACP agent hasn't been sent yet.
    notes: Mutex<HashMap<String, Vec<String>>>,
    /// Task chats that messaged the project chat themselves during their
    /// current turn, which then needs no separate turn-ended update.
    reported: Mutex<HashSet<String>>,
}

struct Queued {
    from: String,
    text: String,
}

/// How a woken delivery went.
pub enum Delivered {
    Now,
    /// The receiver is mid-turn; it gets this once that turn ends.
    Queued,
    /// Too many agent messages in a row; left as a note instead.
    Paused,
}

/// Who `conversation_id` is, as the messages it sends are labelled.
fn label(state: &AppState, conversation_id: &str) -> String {
    if let Some(task) = db::task_for_conversation(&state.db, conversation_id) {
        return format!("task #{} ({})", task.number, task.title);
    }
    match db::get_conversation(&state.db, conversation_id) {
        Some(c) if c.role.as_deref() == Some("project") => "the project chat".into(),
        Some(c) => format!("the chat \"{}\"", c.title.as_deref().unwrap_or("Untitled")),
        None => "another chat".into(),
    }
}

/// Gets a conversation ready to be added to when nobody may have opened it
/// in this run: its checkout registered and its in-memory history loaded
/// from disk — before anything new is written, or that would be loaded
/// twice.
fn prepare(state: &AppState, conversation_id: &str) -> Result<ConversationSummary, String> {
    let row = db::get_conversation(&state.db, conversation_id)
        .ok_or("that conversation no longer exists")?;
    state
        .conversation_roots
        .lock()
        .unwrap()
        .entry(conversation_id.to_string())
        .or_insert_with(|| {
            let project_root = PathBuf::from(&row.project_root);
            let cwd = row
                .worktree_path
                .as_deref()
                .map(PathBuf::from)
                .filter(|p| p.is_dir())
                .unwrap_or_else(|| project_root.clone());
            ConversationRoot { project_root, cwd }
        });
    chat::history::ensure_in_memory(state, conversation_id);
    Ok(row)
}

fn backend_id(state: &AppState, row: &ConversationSummary) -> String {
    row.backend
        .clone()
        .unwrap_or_else(|| state.backends.lock().unwrap().default_backend_id.clone())
}

/// Prepends the notes `session_id` hasn't been sent yet to `prompt` — what
/// an ACP agent gets, since it keeps its own history.
pub(crate) fn with_pending_notes(state: &AppState, session_id: &str, prompt: String) -> String {
    let notes = state.mailroom.notes.lock().unwrap().remove(session_id);
    match notes {
        Some(notes) if !notes.is_empty() => format!(
            "[Updates from the board since your last turn]\n\n{}\n\n---\n\n{prompt}",
            notes.join("\n\n")
        ),
        _ => prompt,
    }
}

/// Leaves `text` in `to`'s transcript as a note from `from`: shown, and seen
/// by the agent on its next turn, without starting one.
pub(crate) fn note(app: &AppHandle, to: &str, from: &str, text: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let row = prepare(&state, to)?;
    db::save_message_from(
        &state.db,
        to,
        &row.project_root,
        &ChatMessage {
            role: "event".into(),
            content: text.to_string(),
            tool_calls: None,
        },
        Some(from),
    );
    if state
        .backends
        .lock()
        .unwrap()
        .is_native(&backend_id(&state, &row))
    {
        chat::remember_in_memory(
            &state,
            to,
            ChatMessage {
                role: "user".into(),
                content: text.to_string(),
                tool_calls: None,
            },
        );
    } else {
        state
            .mailroom
            .notes
            .lock()
            .unwrap()
            .entry(to.to_string())
            .or_default()
            .push(text.to_string());
    }
    let _ = app.emit(
        &format!("chat://{to}/board_note"),
        json!({ "from": from, "content": text }),
    );
    emit_conversation_changed(app, to, "message");
    Ok(())
}

/// Sends `text` to `to` from `from` and has it answer — now, or once its
/// current turn ends.
pub(crate) fn wake(
    app: &AppHandle,
    to: &str,
    from: &str,
    text: String,
) -> Result<Delivered, String> {
    let state = app.state::<AppState>();
    if chat::is_generating(&state, to) {
        state
            .mailroom
            .queued
            .lock()
            .unwrap()
            .entry(to.to_string())
            .or_default()
            .push(Queued {
                from: from.to_string(),
                text,
            });
        return Ok(Delivered::Queued);
    }
    if db::consecutive_agent_messages(&state.db, to) >= MAX_AGENT_MESSAGES_IN_A_ROW {
        note(
            app,
            to,
            from,
            &format!(
                "{text}\n\n(Not answered automatically: other chats have messaged this one \
                 {MAX_AGENT_MESSAGES_IN_A_ROW} times in a row. Write here to carry on.)"
            ),
        )?;
        return Ok(Delivered::Paused);
    }
    let row = prepare(&state, to)?;
    let backend = registry::resolve(
        &state,
        &backend_id(&state, &row),
        row.model.as_deref().unwrap_or_default(),
        row.effort.as_deref(),
        row.agent_mode.as_deref(),
    )?;
    let message = ChatMessage {
        role: "user".into(),
        content: text.clone(),
        tool_calls: None,
    };
    db::save_message_from(&state.db, to, &row.project_root, &message, Some(from));
    chat::remember_in_memory(&state, to, message);
    let _ = app.emit(
        &format!("chat://{to}/agent_message"),
        json!({ "from": from, "content": &text }),
    );
    emit_conversation_changed(app, to, "message");
    let app = app.clone();
    let to = to.to_string();
    tauri::async_runtime::spawn(async move {
        // A failure shows on the conversation's own error event.
        let _ = backend.continue_turn(&app, &to, text).await;
    });
    Ok(Delivered::Now)
}

/// The `send_message` tool: from the calling conversation to `"project"`
/// (its project's board chat) or a task (`"#12"`).
pub(crate) fn send_message(
    app: &AppHandle,
    session_id: &str,
    project_root: &str,
    to: &str,
    message: &str,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    if message.trim().is_empty() {
        return Err("`message` is empty".into());
    }
    let from = commands::top_level_session_id(&state, session_id);
    let text = format!(
        "Message from {}:\n\n{}",
        label(&state, &from),
        message.trim()
    );
    let to = to.trim();

    if to.eq_ignore_ascii_case("project") || to.eq_ignore_ascii_case("project chat") {
        let project_chat = db::ensure_project_chat(&state.db, project_root);
        if project_chat == from {
            return Err(
                "This is the project chat. To message a task, use its number, e.g. \"#12\".".into(),
            );
        }
        let engaged =
            db::task_for_conversation(&state.db, &from).is_some_and(|t| t.engaged_with_project);
        if !engaged {
            note(app, &project_chat, &from, &text)?;
            return Ok(
                "Left it as a note in the project chat: it isn't following this chat right \
                       now, so it'll see it the next time it runs."
                    .into(),
            );
        }
        state.mailroom.reported.lock().unwrap().insert(from.clone());
        return Ok(match wake(app, &project_chat, &from, text)? {
            Delivered::Now => "Sent to the project chat.".into(),
            Delivered::Queued => "Sent: the project chat is busy and gets it once its current turn ends.".into(),
            Delivered::Paused => "Left as a note: the project chat has had too many agent messages in a row, so it isn't answering them automatically until the user writes there.".into(),
        });
    }

    let task = db::find_task(&state.db, project_root, to).ok_or_else(|| {
        format!(
            "`to` must be \"project\" or a task's number (e.g. \"#12\"); there's no task `{to}`."
        )
    })?;
    let target = task.conversation_id.clone().ok_or_else(|| {
        format!(
            "Task #{} hasn't been started, so it has no chat to message yet; start_task it first.",
            task.number
        )
    })?;
    if target == from {
        return Err("That's this chat.".into());
    }
    let from_project_chat = db::get_conversation(&state.db, &from)
        .is_some_and(|c| c.role.as_deref() == Some("project"));
    if from_project_chat && !task.engaged_with_project {
        db::set_task_engaged(&state.db, &task.id, true);
        emit_board_changed_for(app, &state, &task.project_id, Some(&task.id), "engaged");
    }
    Ok(match wake(app, &target, &from, text)? {
        Delivered::Now => format!(
            "Sent to task #{}; its reply will come back to you.",
            task.number
        ),
        Delivered::Queued => format!(
            "Sent: task #{} is busy and gets it once its current turn ends.",
            task.number
        ),
        Delivered::Paused => format!(
            "Left as a note: task #{} has had too many agent messages in a row, so it isn't \
             answering them automatically until the user writes there.",
            task.number
        ),
    })
}

/// The user wrote in `session_id` themselves. If it's a task's chat, they've
/// taken it over: the project chat stops being woken by it.
pub(crate) fn on_user_message(app: &AppHandle, session_id: &str) {
    let state = app.state::<AppState>();
    if let Some(task) = db::task_for_conversation(&state.db, session_id) {
        if task.engaged_with_project {
            db::set_task_engaged(&state.db, &task.id, false);
            emit_board_changed_for(app, &state, &task.project_id, Some(&task.id), "released");
        }
    }
}

fn excerpt(text: &str) -> String {
    let text = text.trim();
    if text.chars().count() <= REPLY_EXCERPT_CHARS {
        return text.to_string();
    }
    let cut: String = text.chars().take(REPLY_EXCERPT_CHARS).collect();
    format!("{cut}…")
}

/// A turn on `session_id` just ended (`chat::set_generating`). Anything
/// that waited for it goes now; otherwise, if it's a task's chat, the
/// project chat hears how it went.
pub(crate) fn on_turn_end(app: &AppHandle, session_id: &str) {
    let state = app.state::<AppState>();
    let queued = state.mailroom.queued.lock().unwrap().remove(session_id);
    if let Some(queued) = queued.filter(|q| !q.is_empty()) {
        let from = queued.last().map(|q| q.from.clone()).unwrap_or_default();
        let text = queued
            .into_iter()
            .map(|q| q.text)
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");
        // It carries on, so its update comes when that turn ends.
        state.mailroom.reported.lock().unwrap().remove(session_id);
        let _ = wake(app, session_id, &from, text);
        return;
    }

    let Some(task) = db::task_for_conversation(&state.db, session_id) else {
        return;
    };
    if state.mailroom.reported.lock().unwrap().remove(session_id) {
        return;
    }
    let Some(root) = db::project_root_for_id(&state.db, &task.project_id) else {
        return;
    };
    let project_chat = db::ensure_project_chat(&state.db, &root);
    let reply = db::load_messages(&state.db, session_id)
        .into_iter()
        .rev()
        .find(|m| m.role == "assistant" && !m.content.trim().is_empty())
        .map(|m| excerpt(&m.content))
        .unwrap_or_else(|| "(no reply)".into());
    let text = format!(
        "Update from task #{} ({}): its turn ended, and it's in {}.\n\nIts last reply:\n\n{}",
        task.number,
        task.title,
        task.status.replace('_', " "),
        reply
    );
    let _ = if task.engaged_with_project {
        wake(app, &project_chat, session_id, text).map(|_| ())
    } else {
        note(app, &project_chat, session_id, &text)
    };
}

/// Whether the project chat is woken by `task_id` — the task chat's
/// "Hand back to project chat" button.
#[tauri::command]
pub fn set_task_engaged(app: AppHandle, task_id: String, engaged: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    let task = db::get_task(&state.db, &task_id).ok_or("no such task")?;
    db::set_task_engaged(&state.db, &task_id, engaged);
    emit_board_changed_for(&app, &state, &task.project_id, Some(&task_id), "engaged");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn long_replies_are_cut_on_a_character_boundary() {
        let long = "é".repeat(REPLY_EXCERPT_CHARS + 10);
        let cut = excerpt(&long);
        assert!(cut.ends_with('…'));
        assert_eq!(cut.chars().count(), REPLY_EXCERPT_CHARS + 1);
        assert_eq!(excerpt("  short  "), "short");
    }
}
