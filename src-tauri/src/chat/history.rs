use super::ChatMessage;
use crate::db::{self, PersistedMessage};
use crate::state::AppState;
use tauri::State;

/// Always reads `session_id`'s full transcript straight from disk — real
/// timestamps, and includes ACP "thinking" rows — so the frontend can render
/// it (also used as-is to (re)load a finished sub-agent's full transcript,
/// since its id round-trips through disk exactly like any other session's).
/// Separately, hydrates `session_id`'s in-memory history the first time it's
/// asked for in this run (e.g. reopening a project after an app restart —
/// see `panelStateByConversation`/`CenterPanel.tsx` on the frontend for how
/// `session_id` ends up equal to the project's path) — once a session has
/// any in-memory history this is left as-is rather than reset, since a live
/// session's in-memory copy can already be ahead of whatever was just read
/// (a turn that's still streaming keeps its own row current on disk, but
/// hasn't pushed itself into `chat_sessions` yet — see `TurnSegment`).
#[tauri::command]
pub fn load_conversation_history(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<PersistedMessage>, String> {
    let messages = db::load_messages(&state.db, &session_id);
    let mut sessions = state.chat_sessions.lock().unwrap();
    sessions.entry(session_id).or_insert_with(|| {
        messages
            .iter()
            // "thinking" rows (ACP reasoning) are never sent to a
            // provider as conversation history: `chat_sessions` doubles
            // as the literal message list a built-in-provider turn sends
            // over the wire, and "thinking" isn't a role either
            // provider's chat API understands. A conversation that
            // switches off ACP later must not have one leak in from
            // before the switch.
            .filter(|m| m.role != "thinking")
            .map(|m| ChatMessage {
                role: m.role.clone(),
                content: m.content.clone(),
                tool_calls: m.tool_calls.clone(),
            })
            .collect()
    });
    Ok(messages)
}

#[tauri::command]
pub fn get_conversation_title(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Option<String>, String> {
    Ok(db::get_conversation_title(&state.db, &session_id))
}

#[tauri::command]
pub fn set_conversation_title(
    state: State<'_, AppState>,
    session_id: String,
    title: Option<String>,
) -> Result<(), String> {
    let title = title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    db::set_conversation_title(&state.db, &session_id, title.as_deref());
    Ok(())
}

/// All sub-agents ever spawned, across every project — the Sub Agents
/// sidebar's own scope (a cross-project history, not scoped to whichever
/// project is currently open). See `db::list_all_sub_agents`.
#[tauri::command]
pub fn list_sub_agents(state: State<AppState>) -> Result<Vec<db::SubAgentSummary>, String> {
    Ok(db::list_all_sub_agents(&state.db))
}

/// Removes one entry from the Sub Agents sidebar for good — see
/// `db::delete_sub_agent`. The frontend only offers this for sub-agents that
/// are no longer `running`, so there's no live turn that could still be
/// writing to this id's transcript.
#[tauri::command]
pub fn delete_sub_agent(state: State<AppState>, sub_session_id: String) -> Result<(), String> {
    db::delete_sub_agent(&state.db, &sub_session_id);
    Ok(())
}
