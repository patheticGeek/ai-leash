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
//! The project chat *follows* the tasks it starts
//! (`Task::engaged_with_project`): whenever a followed task's turn ends, the
//! project chat is woken with its reply (`on_turn_end`). Once the user takes
//! a task over — sends in its chat, or stops it, saying so
//! (`take_over`, `on_user_message`) — nothing is forwarded from it any more:
//! the project chat gets one note saying so, and from then on the two only
//! hear from each other through `send_message`, which still wakes either
//! side. Messaging a task it isn't following doesn't make the project chat
//! follow it again; only the task chat's "Hand back to project chat"
//! (`set_task_engaged`) does.
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
    /// Cleared at every turn end, followed or not.
    reported: Mutex<HashSet<String>>,
}

impl Mailroom {
    /// Everything waiting for `session_id`, as one message from the last
    /// sender — off the queue, so it's delivered once.
    fn take_queued(&self, session_id: &str) -> Option<(String, String)> {
        let queued = self.queued.lock().unwrap().remove(session_id)?;
        let from = queued.last()?.from.clone();
        let text = queued
            .into_iter()
            .map(|q| q.text)
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");
        Some((from, text))
    }
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
fn label(db: &db::Db, conversation_id: &str) -> String {
    if let Some(task) = db::task_for_conversation(db, conversation_id) {
        return format!("task #{} ({})", task.number, task.title);
    }
    match db::get_conversation(db, conversation_id) {
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

/// Where a `send_message` goes and what it says — worked out from the board
/// alone, before anything is delivered.
#[derive(Debug)]
enum Outgoing {
    /// To the project chat, from one of its tasks (or another chat).
    Project { project_chat: String, text: String },
    /// To a task's chat. `followed`: whether the project chat follows it —
    /// left as it is either way.
    Task {
        conversation_id: String,
        number: i64,
        followed: bool,
        text: String,
    },
}

fn plan_send(
    db: &db::Db,
    from: &str,
    project_root: &str,
    to: &str,
    message: &str,
) -> Result<Outgoing, String> {
    if message.trim().is_empty() {
        return Err("`message` is empty".into());
    }
    let text = format!("Message from {}:\n\n{}", label(db, from), message.trim());
    let to = to.trim();

    if to.eq_ignore_ascii_case("project") || to.eq_ignore_ascii_case("project chat") {
        let project_chat = db::ensure_project_chat(db, project_root);
        if project_chat == from {
            return Err(
                "This is the project chat. To message a task, use its number, e.g. \"#12\".".into(),
            );
        }
        // Followed or not: an explicit message is always delivered.
        return Ok(Outgoing::Project { project_chat, text });
    }

    let task = db::find_task(db, project_root, to).ok_or_else(|| {
        format!(
            "`to` must be \"project\" or a task's number (e.g. \"#12\"); there's no task `{to}`."
        )
    })?;
    let conversation_id = task.conversation_id.clone().ok_or_else(|| {
        format!(
            "Task #{} hasn't been started, so it has no chat to message yet.",
            task.number
        )
    })?;
    if conversation_id == from {
        return Err("That's this chat.".into());
    }
    // Messaging a task never makes the project chat follow it again; only
    // the task chat's "Hand back to project chat" does.
    let followed = task.engaged_with_project;
    Ok(Outgoing::Task {
        conversation_id,
        number: task.number,
        followed,
        text: if followed {
            text
        } else {
            format!("{text}{UNFOLLOWED_FRAMING}")
        },
    })
}

/// The `send_message` tool: from the calling conversation to `"project"`
/// (its project's board chat) or a task (`"#12"`). Wakes the receiver
/// whether or not the project chat follows the task.
pub(crate) fn send_message(
    app: &AppHandle,
    session_id: &str,
    project_root: &str,
    to: &str,
    message: &str,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let from = commands::top_level_session_id(&state, session_id);
    match plan_send(&state.db, &from, project_root, to, message)? {
        Outgoing::Project { project_chat, text } => {
            state.mailroom.reported.lock().unwrap().insert(from.clone());
            Ok(match wake(app, &project_chat, &from, text)? {
                Delivered::Now => "Sent to the project chat.".into(),
                Delivered::Queued => "Sent: the project chat is busy and gets it once its current turn ends.".into(),
                Delivered::Paused => "Left as a note: the project chat has had too many agent messages in a row, so it isn't answering them automatically until the user writes there.".into(),
            })
        }
        Outgoing::Task {
            conversation_id,
            number,
            followed,
            text,
        } => {
            let delivered = wake(app, &conversation_id, &from, text)?;
            Ok(send_to_task_result(number, followed, &delivered))
        }
    }
}

/// Appended to a message delivered to a task the project chat isn't
/// following: nothing it says comes back on its own.
const UNFOLLOWED_FRAMING: &str = "\n\n(The user is handling this task, so your reply here \
     won't be forwarded automatically. To answer, use send_message to \"project\".)";

/// What `send_message` tells the sender of a message to task `number`.
fn send_to_task_result(number: i64, followed: bool, delivered: &Delivered) -> String {
    let unfollowed = format!(
        " #{number} is being handled by the user. Its replies won't be forwarded \
         automatically; it can answer you with send_message."
    );
    let tail = if followed { "" } else { unfollowed.as_str() };
    match delivered {
        Delivered::Now if followed => {
            format!("Sent to task #{number}; its reply will come back to you.")
        }
        Delivered::Now => format!("Sent to task #{number}.{tail}"),
        Delivered::Queued => {
            format!("Sent: task #{number} is busy and gets it once its current turn ends.{tail}")
        }
        Delivered::Paused => format!(
            "Left as a note: task #{number} has had too many agent messages in a row, so it \
             isn't answering them automatically until the user writes there.{tail}"
        ),
    }
}

/// Stops the project chat following `session_id`'s task, if it was. The
/// released task, for the caller to announce.
fn release(db: &db::Db, session_id: &str) -> Option<db::Task> {
    let task = db::task_for_conversation(db, session_id)?;
    if !task.engaged_with_project {
        return None;
    }
    db::set_task_engaged(db, &task.id, false);
    Some(task)
}

/// The user took `session_id` over — sent in it or stopped it, choosing to
/// (`take_over`). If it's a followed task's chat, the project chat stops
/// following it and is told so once; nothing more is forwarded from it.
pub(crate) fn on_user_message(app: &AppHandle, session_id: &str) {
    let state = app.state::<AppState>();
    let Some(task) = release(&state.db, session_id) else {
        return;
    };
    emit_board_changed_for(app, &state, &task.project_id, Some(&task.id), "released");
    crate::acp::rate_limit::publish(app, session_id);
    if let Some(root) = db::project_root_for_id(&state.db, &task.project_id) {
        let project_chat = db::ensure_project_chat(&state.db, &root);
        let _ = note(
            app,
            &project_chat,
            session_id,
            &taken_over_note(task.number),
        );
    }
}

fn taken_over_note(number: i64) -> String {
    format!(
        "The user took over #{number}; its replies won't be forwarded. Use send_message to \
         talk to it."
    )
}

fn excerpt(text: &str) -> String {
    let text = text.trim();
    if text.chars().count() <= REPLY_EXCERPT_CHARS {
        return text.to_string();
    }
    let cut: String = text.chars().take(REPLY_EXCERPT_CHARS).collect();
    format!("{cut}…")
}

/// What a task's turn end sends the project chat.
#[derive(Debug, PartialEq)]
enum TurnEnd {
    /// It's followed: wake the project chat with the reply.
    Forward,
    /// It messaged the project chat itself this turn, or isn't followed.
    Nothing,
}

fn turn_end(followed: bool, reported: bool) -> TurnEnd {
    if followed && !reported {
        TurnEnd::Forward
    } else {
        TurnEnd::Nothing
    }
}

/// A turn on `session_id` just ended (`chat::set_generating`). Anything
/// that waited for it goes now — once: it's taken off the queue before it's
/// sent. Otherwise, if it's a followed task's chat, the project chat is
/// woken with how it went; an unfollowed one sends nothing.
pub(crate) fn on_turn_end(app: &AppHandle, session_id: &str) {
    let state = app.state::<AppState>();
    if let Some((from, mut text)) = state.mailroom.take_queued(session_id) {
        // Taken over since it was queued: say its reply won't come back.
        let unfollowed = db::task_for_conversation(&state.db, session_id)
            .is_some_and(|t| !t.engaged_with_project);
        if unfollowed && !text.ends_with(UNFOLLOWED_FRAMING) {
            text.push_str(UNFOLLOWED_FRAMING);
        }
        // It carries on, so its update (if it's followed) comes when that
        // turn ends.
        state.mailroom.reported.lock().unwrap().remove(session_id);
        let _ = wake(app, session_id, &from, text);
        return;
    }

    let Some(task) = db::task_for_conversation(&state.db, session_id) else {
        return;
    };
    let reported = state.mailroom.reported.lock().unwrap().remove(session_id);
    if turn_end(task.engaged_with_project, reported) == TurnEnd::Nothing {
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
    let _ = wake(app, &project_chat, session_id, text);
}

/// The user takes `session_id` over without sending or stopping anything
/// yet — the takeover dialog's answer when they queue a message, so the
/// turn still running isn't forwarded either.
#[tauri::command]
pub fn take_over_task(app: AppHandle, session_id: String) {
    on_user_message(&app, &session_id);
}

/// Whether the project chat is woken by `task_id` — the task chat's
/// "Hand back to project chat" button.
#[tauri::command]
pub fn set_task_engaged(app: AppHandle, task_id: String, engaged: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    let task = db::get_task(&state.db, &task_id).ok_or("no such task")?;
    db::set_task_engaged(&state.db, &task_id, engaged);
    emit_board_changed_for(&app, &state, &task.project_id, Some(&task_id), "engaged");
    // A followed task chat hides its limit banner (the project chat has it).
    if let Some(conversation_id) = &task.conversation_id {
        crate::acp::rate_limit::publish(&app, conversation_id);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use db::{Db, NewTask};

    fn temp_db() -> Db {
        Db::open(std::env::temp_dir().join(format!("ai-leash-test-{}.db", uuid::Uuid::new_v4())))
    }

    /// A started task #1 in "/proj" with chat "task-chat", followed or not;
    /// and the project chat's id.
    fn board(followed: bool) -> (Db, db::Task, String) {
        let db = temp_db();
        let project_chat = db::ensure_project_chat(&db, "/proj");
        let task = db::create_task(
            &db,
            "/proj",
            NewTask {
                title: "a".into(),
                ..Default::default()
            },
        )
        .unwrap();
        db::set_task_conversation(&db, &task.id, Some("task-chat"), followed);
        (db, task, project_chat)
    }

    fn followed(db: &Db, task: &db::Task) -> bool {
        db::get_task(db, &task.id).unwrap().engaged_with_project
    }

    #[test]
    fn an_unfollowed_task_forwards_nothing_at_turn_end() {
        assert_eq!(turn_end(false, false), TurnEnd::Nothing);
        assert_eq!(turn_end(false, true), TurnEnd::Nothing);
        assert_eq!(turn_end(true, false), TurnEnd::Forward);
        // It messaged the project chat itself this turn.
        assert_eq!(turn_end(true, true), TurnEnd::Nothing);
    }

    #[test]
    fn an_unfollowed_task_can_still_message_the_project_chat() {
        let (db, _, project_chat) = board(false);
        match plan_send(&db, "task-chat", "/proj", "project", "done").unwrap() {
            Outgoing::Project {
                project_chat: to,
                text,
            } => {
                assert_eq!(to, project_chat);
                assert!(text.starts_with("Message from task #1 (a)"));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn the_project_chat_can_message_an_unfollowed_task_without_following_it() {
        let (db, task, project_chat) = board(false);
        match plan_send(&db, &project_chat, "/proj", "#1", "do x").unwrap() {
            Outgoing::Task {
                conversation_id,
                followed: was_followed,
                text,
                ..
            } => {
                assert_eq!(conversation_id, "task-chat");
                assert!(!was_followed);
                assert!(text.ends_with(UNFOLLOWED_FRAMING));
            }
            other => panic!("{other:?}"),
        }
        assert!(!followed(&db, &task));
        let result = send_to_task_result(1, false, &Delivered::Now);
        assert!(result.contains("#1 is being handled by the user"));
        assert!(!result.contains("will come back"));
        assert!(send_to_task_result(1, false, &Delivered::Queued)
            .contains("is being handled by the user"));
    }

    #[test]
    fn a_followed_task_gets_plain_messages_and_its_reply_comes_back() {
        let (db, task, project_chat) = board(true);
        match plan_send(&db, &project_chat, "/proj", "#1", "do x").unwrap() {
            Outgoing::Task {
                text, followed: f, ..
            } => {
                assert!(f);
                assert!(!text.contains(UNFOLLOWED_FRAMING));
            }
            other => panic!("{other:?}"),
        }
        assert!(followed(&db, &task));
        assert!(send_to_task_result(1, true, &Delivered::Now).contains("will come back"));
    }

    #[test]
    fn a_queued_message_is_delivered_once_and_its_reply_not_forwarded() {
        let mailroom = Mailroom::default();
        for text in ["one", "two"] {
            mailroom
                .queued
                .lock()
                .unwrap()
                .entry("task-chat".into())
                .or_default()
                .push(Queued {
                    from: "project".into(),
                    text: text.into(),
                });
        }
        let (from, text) = mailroom.take_queued("task-chat").unwrap();
        assert_eq!(from, "project");
        assert_eq!(text, "one\n\n---\n\ntwo");
        assert!(mailroom.take_queued("task-chat").is_none());
        // Taken over meanwhile: the turn that answers it forwards nothing.
        assert_eq!(turn_end(false, false), TurnEnd::Nothing);
    }

    #[test]
    fn taking_over_releases_a_followed_task_once() {
        // What Stop and a send with `take_over` both do.
        let (db, task, _) = board(true);
        assert_eq!(release(&db, "task-chat").unwrap().id, task.id);
        assert!(!followed(&db, &task));
        assert!(release(&db, "task-chat").is_none());
        assert!(release(&db, "not-a-task").is_none());
        assert!(taken_over_note(1).starts_with("The user took over #1;"));
    }

    #[test]
    fn without_taking_over_the_task_stays_followed() {
        // `take_over: false` never calls `on_user_message`, so nothing
        // else changes it.
        let (db, task, project_chat) = board(true);
        plan_send(&db, &project_chat, "/proj", "#1", "hi").unwrap();
        plan_send(&db, "task-chat", "/proj", "project", "hi").unwrap();
        assert!(followed(&db, &task));
    }

    #[test]
    fn long_replies_are_cut_on_a_character_boundary() {
        let long = "é".repeat(REPLY_EXCERPT_CHARS + 10);
        let cut = excerpt(&long);
        assert!(cut.ends_with('…'));
        assert_eq!(cut.chars().count(), REPLY_EXCERPT_CHARS + 1);
        assert_eq!(excerpt("  short  "), "short");
    }
}
