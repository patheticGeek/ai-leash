use super::{paginate_lines, truncate, DEFAULT_READ_LIMIT};
use crate::acp::AcpCommand;
use crate::chat;
use crate::db;
use crate::provider::ProviderConfig;
use crate::state::AppState;
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

/// Resolves whatever a model passed as `sub_session_id` (`read_sub_agent`)
/// to one of this session's actual sub-agent ids — full ids look like
/// `{parent_session_id}::spawn_sub_agent::{uuid}`, and `parent_session_id`
/// is often a whole project path, so the full id can run 60-100+ chars.
/// Models asked to reproduce that exactly are prone to paraphrasing it —
/// dropping the prefix, or truncating the middle with `...`/`??`/`…` — so
/// this tries progressively looser matches, scoped to this session's own
/// sub-agents only (never another session's):
///   1. The exact id as given.
///   2. Just the trailing UUID, missing the `{parent}::spawn_sub_agent::` prefix.
///   3. A truncated/elided fragment (trailing `.`/`?`/`…` stripped), matched
///      by substring against this session's sub-agent ids — only if that
///      leaves exactly one candidate and the fragment is long enough
///      (>= 6 chars) to not match by coincidence.
fn resolve_sub_agent_id(db: &db::Db, session_id: &str, given: &str) -> Option<String> {
    let expected_prefix = format!("{session_id}::spawn_sub_agent::");
    if given.starts_with(&expected_prefix) && db::get_sub_agent(db, given).is_some() {
        return Some(given.to_string());
    }
    let reconstructed = format!("{expected_prefix}{given}");
    if db::get_sub_agent(db, &reconstructed).is_some() {
        return Some(reconstructed);
    }
    let cleaned = given.trim_end_matches(['.', '?', '…', ' ']);
    if cleaned.len() < 6 {
        return None;
    }
    let mut candidates = db::list_sub_agents_for_parent(db, session_id, 500)
        .into_iter()
        .filter(|s| s.id.contains(cleaned));
    let first = candidates.next()?;
    if candidates.next().is_some() {
        return None; // ambiguous — let the caller ask for `list_sub_agents`
    }
    Some(first.id)
}

#[allow(clippy::too_many_arguments)]
pub(super) fn spawn_sub_agent(
    app: &AppHandle,
    state: &State<'_, AppState>,
    session_id: &str,
    call_id: Option<&str>,
    provider: &ProviderConfig,
    model: &str,
    args: &Value,
) -> Result<String, String> {
    const TASK_SHAPE_HINT: &str = "Each entry in `tasks` must be an object with exactly two string fields: `description` (a short label) and `prompt` (full self-contained instructions for the sub-agent). Example: {\"tasks\": [{\"description\": \"count rs files\", \"prompt\": \"Count how many .rs files exist in the project and report the number.\"}]}. Retry the `spawn_sub_agent` call with that exact shape.";

    let tasks = args
        .get("tasks")
        .and_then(|v| v.as_array())
        .filter(|a| !a.is_empty())
        .ok_or_else(|| format!("missing or empty `tasks`. {TASK_SHAPE_HINT}"))?;

    let mut specs = Vec::with_capacity(tasks.len());
    for t in tasks {
        // Small/local models calling this schema sometimes reach for
        // familiar chat-message field names (`content`/`text`/`role`)
        // instead of `prompt`/`description` — accept the common
        // aliases rather than failing on an otherwise-correct call.
        let description = t
            .get("description")
            .or_else(|| t.get("title"))
            .or_else(|| t.get("name"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let prompt = t
            .get("prompt")
            .or_else(|| t.get("content"))
            .or_else(|| t.get("text"))
            .or_else(|| t.get("instructions"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| format!("a `tasks` entry is missing `prompt`. {TASK_SHAPE_HINT}"))?;
        // If the model omitted a real description, derive a short,
        // distinguishable one from the prompt itself rather than
        // labeling every subtask identically as "Subtask".
        let description = description.unwrap_or_else(|| {
            let words: Vec<&str> = prompt.split_whitespace().take(6).collect();
            let mut label = words.join(" ");
            if label.len() > 40 {
                label.truncate(40);
            }
            if label.is_empty() {
                "Subtask".to_string()
            } else {
                label
            }
        });
        let sub_session_id = format!("{session_id}::spawn_sub_agent::{}", Uuid::new_v4());
        // Inherit the parent's bypass setting — same reasoning as
        // sharing its cancellation flag (see `run_sub_agent`'s doc
        // comment in chat.rs): a sub-agent has no textarea of its
        // own to show a permission popover above anyway.
        {
            let mut bypass_set = state.permission_bypass.lock().unwrap();
            if bypass_set.contains(session_id) {
                bypass_set.insert(sub_session_id.clone());
            }
        }

        db::record_sub_agent_started(
            &state.db,
            &sub_session_id,
            session_id,
            &description,
            &prompt,
        );
        let _ = app.emit(
            &format!("chat://{session_id}/subtask_start"),
            json!({
                "callId": call_id,
                "subSessionId": sub_session_id,
                "description": description,
            }),
        );
        specs.push((description, prompt, sub_session_id));
    }

    // Every sub-agent always runs fully detached — this call never
    // waits on any of them. Each independently records its own
    // finish and autonomously resumes the parent conversation (a
    // brand new turn, not triggered by the user) as soon as it's
    // ready — see `chat::resume_after_background_subtask`. Each gets
    // its own fresh cancel flag rather than sharing the parent's,
    // since nothing here awaits them together anymore.
    let count = specs.len();
    let labels: Vec<String> = specs.iter().map(|(d, _, _)| d.clone()).collect();

    for (description, prompt, sub_session_id) in specs {
        let app_owned = app.clone();
        let session_id_owned = session_id.to_string();
        let provider_owned = provider.clone();
        let model_owned = model.to_string();
        tokio::spawn(async move {
            let state = app_owned.state::<AppState>();
            let cancel_flag = Arc::new(AtomicBool::new(false));
            // Registered under its own sub_session_id (not the
            // parent's) so the Sub Agents tab's Stop button
            // (`cancel_prompt`) can target this one task without
            // touching the parent conversation or its siblings —
            // see the Stop button in `SubAgentsTab.tsx`.
            state
                .cancellations
                .lock()
                .unwrap()
                .insert(sub_session_id.clone(), cancel_flag.clone());
            let outcome = chat::run_sub_agent(
                &app_owned,
                &state,
                &session_id_owned,
                &sub_session_id,
                &prompt,
                &provider_owned,
                &model_owned,
                &cancel_flag,
            )
            .await;
            state.cancellations.lock().unwrap().remove(&sub_session_id);
            let (status, result) = match outcome {
                Ok(text) => ("done", text),
                Err(e) => ("error", format!("Error: {e}")),
            };
            db::record_sub_agent_finished(&state.db, &sub_session_id, status, &result);

            // If the parent session is currently an external ACP
            // agent's conversation (not AI Leash's own native
            // loop), its real "agent" is that subprocess, waiting
            // on its own command channel — resuming via the native
            // `resume_after_background_subtask` would instead spin
            // up a second, parallel native agent loop talking in
            // the same transcript, while the actual ACP subprocess
            // never learns the sub-agent finished. Notify it over
            // its existing channel instead, the same mechanism a
            // real user message uses (`send_prompt_acp`). ACP has
            // no equivalent of injecting a synthetic tool-call/
            // tool-result pair without generating a turn, so this
            // is necessarily a plain user-role message rather than
            // the tool-call-shaped pair built below.
            let acp_sender = state
                .acp_sessions
                .lock()
                .unwrap()
                .get(&session_id_owned)
                .map(|s| s.sender.clone());

            if let Some(sender) = acp_sender {
                let _ = sender.send(AcpCommand::Prompt(format!(
                    "[Sub-agent \"{description}\" finished]\n\n{result}"
                )));
            } else {
                chat::resume_after_background_subtask(
                    app_owned,
                    session_id_owned,
                    provider_owned,
                    model_owned,
                    sub_session_id,
                    description,
                    result,
                )
                .await;
            }
        });
    }

    Ok(format!(
        "Spawned {count} sub-agent(s): {}. Results will be appended to this chat as each finishes — no need to call list_sub_agents or read_sub_agent to check, just continue or stop here and wait.",
        labels.join(", ")
    ))
}

pub(super) fn list_sub_agents(
    state: &State<'_, AppState>,
    session_id: &str,
) -> Result<String, String> {
    let items = db::list_sub_agents_for_parent(&state.db, session_id, 50);
    if items.is_empty() {
        return Ok("No sub-agents have been spawned by this session.".to_string());
    }
    let lines: Vec<String> = items
        .iter()
        .map(|s| {
            let timing = match s.finished_at {
                Some(f) => format!("finished (took {}s)", (f - s.started_at).max(0)),
                None => "running".to_string(),
            };
            format!("{} [{}] {} — \"{}\"", s.id, s.status, timing, s.description)
        })
        .collect();
    Ok(truncate(lines.join("\n")))
}

pub(super) fn read_sub_agent(
    state: &State<'_, AppState>,
    session_id: &str,
    args: &Value,
) -> Result<String, String> {
    let given = args
        .get("sub_session_id")
        .and_then(|v| v.as_str())
        .ok_or("missing `sub_session_id`")?;
    let target = resolve_sub_agent_id(&state.db, session_id, given).ok_or_else(|| {
        format!("no sub-agent found matching {given:?}. Use list_sub_agents to see valid ids.")
    })?;
    // resolve_sub_agent_id only returns ids it already confirmed exist.
    let meta = db::get_sub_agent(&state.db, &target).expect("resolved sub-agent id exists");
    let messages = db::load_messages(&state.db, &target);
    let mut transcript = format!("Status: {}\n\nPrompt:\n{}\n", meta.status, meta.prompt);
    for (i, m) in messages.iter().enumerate() {
        if i == 0 && m.role == "user" {
            continue; // already shown as "Prompt" above
        }
        transcript.push_str(&format!("\n### {}\n{}\n", m.role, m.content));
    }

    let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(1);
    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(DEFAULT_READ_LIMIT);
    Ok(truncate(paginate_lines(
        &transcript,
        offset,
        limit,
        &target,
        "read_sub_agent again",
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> db::Db {
        let path = std::env::temp_dir().join(format!("ai-leash-test-{}.db", Uuid::new_v4()));
        db::Db::open(path)
    }

    fn start(db: &db::Db, parent: &str, uuid_suffix: &str) -> String {
        let id = format!("{parent}::spawn_sub_agent::{uuid_suffix}");
        db::record_sub_agent_started(db, &id, parent, "a task", "do it");
        id
    }

    #[test]
    fn resolves_the_exact_full_id() {
        let db = temp_db();
        let id = start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(resolve_sub_agent_id(&db, "/proj", &id), Some(id));
    }

    #[test]
    fn resolves_just_the_trailing_uuid() {
        let db = temp_db();
        let id = start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(
            resolve_sub_agent_id(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000"),
            Some(id)
        );
    }

    #[test]
    fn resolves_a_truncated_id_with_an_ellipsis() {
        let db = temp_db();
        let id = start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(
            resolve_sub_agent_id(&db, "/proj", "/proj::spawn_sub_agent::550e8400..."),
            Some(id)
        );
    }

    #[test]
    fn resolves_a_truncated_id_with_double_question_marks() {
        let db = temp_db();
        let id = start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(
            resolve_sub_agent_id(&db, "/proj", "550e8400-e29b??"),
            Some(id)
        );
    }

    #[test]
    fn refuses_to_guess_when_the_fragment_is_too_short() {
        let db = temp_db();
        start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(resolve_sub_agent_id(&db, "/proj", "550e?"), None);
    }

    #[test]
    fn refuses_to_guess_when_the_fragment_is_ambiguous() {
        let db = temp_db();
        start(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000");
        start(&db, "/proj", "550e8400-aaaa-41d4-a716-446655440000");
        assert_eq!(resolve_sub_agent_id(&db, "/proj", "550e8400..."), None);
    }

    #[test]
    fn never_resolves_another_sessions_sub_agent() {
        let db = temp_db();
        let id = start(&db, "/other", "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(resolve_sub_agent_id(&db, "/proj", &id), None);
        assert_eq!(
            resolve_sub_agent_id(&db, "/proj", "550e8400-e29b-41d4-a716-446655440000"),
            None
        );
    }
}
