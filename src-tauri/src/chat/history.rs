use super::ChatMessage;
use crate::db::{self, PersistedMessage};
use crate::state::AppState;
use tauri::State;

/// Hydrates `session_id`'s in-memory history from disk the first time it's
/// asked for in this run (e.g. reopening a project after an app restart —
/// see `panelStateByConversation`/`CenterPanel.tsx` on the frontend for how
/// `session_id` ends up equal to the project's path), and returns it either
/// way so the frontend can render it. Once a session has any in-memory
/// history, this returns that as-is rather than re-reading disk — also used
/// as-is by the frontend to (re)load a finished sub-agent's full transcript,
/// since its id round-trips through disk exactly like any other session's.
#[tauri::command]
pub fn load_conversation_history(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<PersistedMessage>, String> {
    let mut sessions = state.chat_sessions.lock().unwrap();
    if let Some(existing) = sessions.get(&session_id) {
        return Ok(existing
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| PersistedMessage {
                role: m.role.clone(),
                content: m.content.clone(),
                tool_calls: m.tool_calls.clone(),
                created_at: 0,
            })
            .collect());
    }

    let messages = db::load_messages(&state.db, &session_id);
    sessions.insert(
        session_id,
        messages
            .iter()
            .map(|m| ChatMessage {
                role: m.role.clone(),
                content: m.content.clone(),
                tool_calls: m.tool_calls.clone(),
            })
            .collect(),
    );
    Ok(messages)
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
