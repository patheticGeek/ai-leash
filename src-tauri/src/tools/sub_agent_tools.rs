use super::{paginate_lines, truncate, DEFAULT_READ_LIMIT};
use crate::acp::AcpCommand;
use crate::chat;
use crate::db;
use crate::provider::{self, ProviderConfig, EFFORT_LEVELS};
use crate::state::{AcpAgentCatalogEntry, AppState};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

pub(crate) fn spawn_sub_agent_def() -> Value {
    json!({
        "name": "spawn_sub_agent",
        "description": "Delegate one or more self-contained subtasks to fresh sub-agents, each with its own isolated context and the same tools (except spawn_sub_agent itself, so they can't spawn further sub-agents). If the request has multiple independent parts, list them all in `tasks` — they run concurrently, which is faster than doing them one at a time. If it's a single simple thing, or its parts depend on each other's results, either pass just one entry or don't call this at all and handle it yourself. This call returns immediately once the sub-agent(s) are spawned, without waiting for any of them to finish — each one's result is appended to this conversation as its own turn as soon as it's ready, and you'll automatically get a chance to react, without the user needing to say anything. Use `list_sub_agents`/`read_sub_agent` if you need to check on one proactively instead of waiting.",
        "parameters": {
            "type": "object",
            "properties": {
                "tasks": {
                    "type": "array",
                    "description": "One entry per independent subtask to run concurrently",
                    "items": {
                        "type": "object",
                        "properties": {
                            "description": { "type": "string", "description": "Short (3-6 word) label for this subtask, shown to the user" },
                            "prompt": { "type": "string", "description": "Full, self-contained instructions for the sub-agent" }
                        },
                        "required": ["description", "prompt"]
                    }
                },
                "agent": { "type": "string", "description": "Optional: WHICH BACKEND to run all subtasks through — the id or label of a configured external ACP agent (e.g. \"Claude Code\"), never a model name. Call list_agent_options first to see exactly what's configured; do not guess. Omit entirely to use AI Leash's own native provider instead of any ACP agent." },
                "model": { "type": "string", "description": "Optional: a real, concrete model id for all subtasks — call list_agent_options first and copy one of the exact names/ids it lists; do not guess. Without `agent`: one of the native provider's actual model ids (e.g. an Ollama tag like `llama3.1:8b`, or a real OpenAI-compatible model id) — NOT the provider's own name (never pass `\"ollama\"` here, that names the backend, not a model). With `agent` set: one of that specific agent's own listed models (e.g. `sonnet`, `opus`, `claude-opus-4-1`) — NOT the agent's own label (never pass `\"Claude Code\"` here, that goes in `agent`). Omit to reuse the current model." },
                "effort": { "type": "string", "description": "Optional reasoning effort for all subtasks — call list_agent_options first to see valid values, do not guess. Without `agent`: exactly one of low/medium/high, forwarded as the native provider's reasoning effort. With `agent`: one of that agent's own listed effort/thought-level values instead. Omit for the default." }
            },
            "required": ["tasks"]
        }
    })
}

pub(crate) fn list_sub_agents_def() -> Value {
    json!({
        "name": "list_sub_agents",
        "description": "List the sub-agents you've spawned via spawn_sub_agent (running and finished), most recent first. Use this to check progress, or to find a sub_session_id for read_sub_agent.",
        "parameters": { "type": "object", "properties": {}, "required": [] }
    })
}

pub(crate) fn read_sub_agent_def() -> Value {
    json!({
        "name": "read_sub_agent",
        "description": "Read the full prompt and transcript (including tool calls and the final result) of one sub-agent you spawned, by its sub_session_id. For long transcripts, prefer offset/limit over reading it all at once.",
        "parameters": {
            "type": "object",
            "properties": {
                "sub_session_id": { "type": "string", "description": "The sub-agent's session id, from list_sub_agents" },
                "offset": { "type": "integer", "description": "1-based line number to start reading from. Omit to start at line 1." },
                "limit": { "type": "integer", "description": "Maximum number of lines to return. Defaults to 2000." }
            },
            "required": ["sub_session_id"]
        }
    })
}

pub(crate) fn list_agent_options_def() -> Value {
    json!({
        "name": "list_agent_options",
        "description": "List the exact `agent`/`model`/`effort` values currently valid to pass to spawn_sub_agent — real model ids/names, real ACP agent ids/labels, and real effort levels, never a provider name like \"ollama\" or a guess. Call this before spawn_sub_agent whenever you want anything other than the default model, so you copy a value from here instead of guessing one.",
        "parameters": { "type": "object", "properties": {}, "required": [] }
    })
}

fn requested_effort(args: &Value) -> Result<Option<String>, String> {
    let Some(effort) = args.get("effort") else {
        return Ok(None);
    };
    let effort = effort
        .as_str()
        .ok_or_else(|| format!("`effort` must be one of: {}", EFFORT_LEVELS.join(", ")))?;
    if EFFORT_LEVELS.contains(&effort) {
        Ok(Some(effort.to_string()))
    } else {
        Err(format!(
            "unrecognized `effort` {effort:?}; must be one of: {}",
            EFFORT_LEVELS.join(", ")
        ))
    }
}

/// A `spawn_sub_agent` call's resolved "run this batch through an external
/// ACP agent instead of the native provider" target — `None` unless the
/// call gave an `agent` argument matching an entry in
/// `state.acp_agent_catalog` (see that type's doc comment).
#[derive(Clone, Debug, PartialEq)]
struct AcpSubAgentTarget {
    label: String,
    launch_command: String,
    model_value: Option<String>,
    effort_value: Option<String>,
}

/// Finds a `value` or `name` (case-insensitively) inside a cached
/// `model_options_payload`/`thought_level_options_payload`-shaped JSON
/// value's `options` array, returning the underlying `value` string
/// `SetSessionConfigOptionRequest` expects.
fn resolve_acp_option_value(options: Option<&Value>, wanted: &str) -> Option<String> {
    let opts = options?.get("options")?.as_array()?;
    opts.iter().find_map(|o| {
        let value = o.get("value")?.as_str()?;
        let name = o.get("name")?.as_str()?;
        (value.eq_ignore_ascii_case(wanted) || name.eq_ignore_ascii_case(wanted))
            .then(|| value.to_string())
    })
}

/// Resolves `args.agent`/`args.model`/`args.effort` into an
/// `AcpSubAgentTarget` against the backend's cached ACP agent catalog —
/// `Ok(None)` when `agent` was omitted entirely (the ordinary native path).
/// Errors (rather than silently ignoring) an unrecognized `agent`, or a
/// `model`/`effort` that doesn't match any of that agent's cached options,
/// since a sub-agent silently running with the wrong backend/model is much
/// harder to notice than a rejected tool call. Takes a plain catalog slice
/// (the caller clones it out of `state.acp_agent_catalog`'s mutex) rather
/// than `State` directly, so this stays unit-testable without any Tauri
/// machinery.
fn resolve_acp_target(
    catalog: &[AcpAgentCatalogEntry],
    args: &Value,
) -> Result<Option<AcpSubAgentTarget>, String> {
    let Some(given) = args.get("agent").and_then(Value::as_str) else {
        return Ok(None);
    };
    let entry = catalog
        .iter()
        .find(|e| e.id.eq_ignore_ascii_case(given) || e.label.eq_ignore_ascii_case(given))
        .cloned()
        .ok_or_else(|| {
            let known: Vec<&str> = catalog.iter().map(|e| e.label.as_str()).collect();
            let known = if known.is_empty() {
                "none configured".to_string()
            } else {
                known.join(", ")
            };
            format!(
                "unrecognized `agent` {given:?}; configured ACP agents: {known}. Call list_agent_options to see what's available."
            )
        })?;

    let model_value = match args.get("model").and_then(Value::as_str) {
        Some(wanted) => Some(
            resolve_acp_option_value(entry.model_options.as_ref(), wanted).ok_or_else(|| {
                format!(
                    "agent {:?} has no cached model option matching {wanted:?}. Call list_agent_options to see valid values, or omit `model` to use its default.",
                    entry.label
                )
            })?,
        ),
        None => None,
    };
    let effort_value = match args.get("effort").and_then(Value::as_str) {
        Some(wanted) => Some(
            resolve_acp_option_value(entry.effort_options.as_ref(), wanted).ok_or_else(|| {
                format!(
                    "agent {:?} has no cached effort option matching {wanted:?}. Call list_agent_options to see valid values, or omit `effort` to use its default.",
                    entry.label
                )
            })?,
        ),
        None => None,
    };

    Ok(Some(AcpSubAgentTarget {
        label: entry.label,
        launch_command: entry.launch_command,
        model_value,
        effort_value,
    }))
}

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
    // `agent` switches this whole batch to run through an external ACP
    // agent instead of the native provider — `model`/`effort` mean
    // something different in that case (that agent's own config options,
    // validated inside `resolve_acp_target`), so the native-only enum
    // check below only applies when no `agent` was given.
    let acp_catalog_snapshot = state.acp_agent_catalog.lock().unwrap().clone();
    let acp_target = resolve_acp_target(&acp_catalog_snapshot, args)?;
    let requested_model = args
        .get("model")
        .and_then(Value::as_str)
        .filter(|model| !model.trim().is_empty())
        .unwrap_or(model)
        .to_string();
    let requested_effort = if acp_target.is_some() {
        None
    } else {
        requested_effort(args)?
    };
    // What gets persisted/shown in the Sub Agents tab — distinct from
    // `requested_model`/`requested_effort` above (which drive the native
    // path only): an ACP-backed batch shows the agent's label (plus its
    // selected model, if any) instead of the parent's native model string.
    let (display_model, display_effort): (String, Option<String>) = match &acp_target {
        Some(target) => {
            let model_suffix = target
                .model_value
                .as_deref()
                .map(|v| format!(" · {v}"))
                .unwrap_or_default();
            (
                format!("{}{model_suffix}", target.label),
                target.effort_value.clone(),
            )
        }
        None => (requested_model.clone(), requested_effort.clone()),
    };

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
            &display_model,
            display_effort.as_deref(),
        );
        let _ = app.emit(
            &format!("chat://{session_id}/subtask_start"),
            json!({
                "callId": call_id,
                "subSessionId": sub_session_id,
                "description": description,
                "model": display_model,
                "effort": display_effort,
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
        let model_owned = requested_model.clone();
        let effort_owned = requested_effort.clone();
        let acp_target_owned = acp_target.clone();
        tokio::spawn(async move {
            let state = app_owned.state::<AppState>();
            let cancel_flag = Arc::new(AtomicBool::new(false));
            // Registered under its own sub_session_id (not the
            // parent's) so the Sub Agents tab's Stop button
            // (`cancel_prompt`) can target this one task without
            // touching the parent conversation or its siblings —
            // see the Stop button in `SubAgentsTab.tsx`. For an
            // ACP-backed sub-agent this flag is never actually polled
            // (`crate::acp::run_sub_agent_acp` doesn't read it) — Stop
            // still works for it via `signal_cancel`'s separate
            // `acp_sessions` check, since `run_sub_agent_acp` registers
            // this same `sub_session_id` there.
            state
                .cancellations
                .lock()
                .unwrap()
                .insert(sub_session_id.clone(), cancel_flag.clone());
            let outcome = if let Some(target) = &acp_target_owned {
                crate::acp::run_sub_agent_acp(
                    &app_owned,
                    &state,
                    &sub_session_id,
                    &target.launch_command,
                    provider_owned.clone(),
                    model_owned.clone(),
                    target.model_value.clone(),
                    target.effort_value.clone(),
                    &prompt,
                )
                .await
            } else {
                chat::run_sub_agent(
                    &app_owned,
                    &state,
                    &session_id_owned,
                    &sub_session_id,
                    &prompt,
                    &provider_owned,
                    &model_owned,
                    effort_owned.as_deref(),
                    &cancel_flag,
                )
                .await
            };
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
                let _ = sender.send(AcpCommand::Prompt(
                    format!("[Sub-agent \"{description}\" finished]\n\n{result}"),
                    None,
                ));
            } else {
                chat::resume_after_background_subtask(
                    app_owned,
                    session_id_owned,
                    provider_owned,
                    model_owned,
                    effort_owned,
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

pub(super) async fn list_agent_options(
    state: &State<'_, AppState>,
    provider: &ProviderConfig,
) -> Result<String, String> {
    let mut output = String::from(
        "NATIVE PROVIDER — pass these to spawn_sub_agent WITHOUT an `agent` argument (omit `agent` entirely):\n",
    );
    match provider::list_provider_models(provider.clone()).await {
        Ok(models) if models.is_empty() => {
            output.push_str(
                "  This OpenAI-compatible provider does not expose a model listing API — omit `model` too, to reuse the current model.",
            );
        }
        Ok(models) => {
            let ids = models
                .into_iter()
                .map(|model| model.name)
                .collect::<Vec<_>>();
            output.push_str(&format!("  model: {}", ids.join(", ")));
        }
        Err(error) => output.push_str(&format!("  Could not list provider models: {error}")),
    };
    output.push_str(&format!(
        "\n  effort: {} (a fixed level, not a model list)",
        EFFORT_LEVELS.join(", ")
    ));
    if matches!(provider, ProviderConfig::Ollama { .. }) {
        output.push_str(" — ignored on Ollama");
    }
    // Guards against a common wrong guess: the provider's own name (e.g.
    // "ollama") is not a model id, and models calling this tool without
    // reading closely sometimes pass it as one anyway.
    output.push_str(
        "\n  Never pass the provider's own name (e.g. \"ollama\") as `model` — it is not a model id.",
    );

    let catalog = state.acp_agent_catalog.lock().unwrap().clone();
    if catalog.is_empty() {
        output.push_str(
            "\n\nNo external ACP agents configured — `agent` has nothing valid to select right now.",
        );
    } else {
        output.push_str(
            "\n\nACP AGENTS — pass one of these ids/labels as `agent`, then (optionally) one of THAT agent's own models/effort levels below as `model`/`effort`. Never pass an agent's own label as `model`, and never mix one agent's model name with a different agent's `agent` value:",
        );
        for entry in &catalog {
            output.push_str(&format!("\n- agent: {:?} (id: {})", entry.label, entry.id));
            match &entry.model_options {
                Some(options) => {
                    if let Some(names) = option_names(options) {
                        output.push_str(&format!("\n  model: {}", names.join(", ")));
                    }
                }
                None => output.push_str(
                    "\n  model: none cached yet — open a chat with this agent once to discover them",
                ),
            }
            if let Some(options) = &entry.effort_options {
                if let Some(names) = option_names(options) {
                    output.push_str(&format!("\n  effort: {}", names.join(", ")));
                }
            }
        }
    }

    Ok(output)
}

fn option_names(options: &Value) -> Option<Vec<&str>> {
    let opts = options.get("options")?.as_array()?;
    Some(
        opts.iter()
            .filter_map(|o| o.get("name")?.as_str())
            .collect(),
    )
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
        db::record_sub_agent_started(db, &id, parent, "a task", "do it", "llama3", None);
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
    fn accepts_supported_effort_levels() {
        for effort in ["low", "medium", "high"] {
            assert_eq!(
                requested_effort(&json!({ "effort": effort })),
                Ok(Some(effort.to_string()))
            );
        }
    }

    #[test]
    fn rejects_unsupported_effort_levels() {
        let error = requested_effort(&json!({ "effort": "xhigh" })).unwrap_err();
        assert!(error.contains("low, medium, high"));
    }

    #[test]
    fn omitting_effort_uses_provider_default() {
        assert_eq!(requested_effort(&json!({})), Ok(None));
    }

    fn test_agent(id: &str, label: &str) -> AcpAgentCatalogEntry {
        AcpAgentCatalogEntry {
            id: id.to_string(),
            label: label.to_string(),
            launch_command: format!("run-{id}"),
            model_options: Some(json!({
                "id": "model-opt",
                "name": "Model",
                "currentValue": "sonnet",
                "options": [
                    { "value": "sonnet", "name": "Claude Sonnet" },
                    { "value": "opus", "name": "Claude Opus" },
                ],
            })),
            effort_options: Some(json!({
                "id": "effort-opt",
                "name": "Thinking",
                "currentValue": "medium",
                "options": [
                    { "value": "low", "name": "Low" },
                    { "value": "high", "name": "High" },
                ],
            })),
        }
    }

    #[test]
    fn omitting_agent_skips_the_acp_path_entirely() {
        assert_eq!(resolve_acp_target(&[], &json!({})), Ok(None));
    }

    #[test]
    fn rejects_an_unrecognized_agent() {
        let catalog = [test_agent("claude-code", "Claude Code")];
        let error = resolve_acp_target(&catalog, &json!({ "agent": "nonexistent" })).unwrap_err();
        assert!(error.contains("Claude Code"));
    }

    #[test]
    fn matches_an_agent_by_id_or_label_case_insensitively() {
        let catalog = [test_agent("claude-code", "Claude Code")];
        assert!(
            resolve_acp_target(&catalog, &json!({ "agent": "claude-code" }))
                .unwrap()
                .is_some()
        );
        assert!(
            resolve_acp_target(&catalog, &json!({ "agent": "CLAUDE CODE" }))
                .unwrap()
                .is_some()
        );
    }

    #[test]
    fn resolves_model_and_effort_by_value_or_name() {
        let catalog = [test_agent("claude-code", "Claude Code")];
        let target = resolve_acp_target(
            &catalog,
            &json!({ "agent": "Claude Code", "model": "Claude Opus", "effort": "low" }),
        )
        .unwrap()
        .unwrap();
        assert_eq!(target.model_value.as_deref(), Some("opus"));
        assert_eq!(target.effort_value.as_deref(), Some("low"));
    }

    #[test]
    fn rejects_a_model_not_offered_by_the_agent() {
        let catalog = [test_agent("claude-code", "Claude Code")];
        let error = resolve_acp_target(
            &catalog,
            &json!({ "agent": "Claude Code", "model": "gpt-5" }),
        )
        .unwrap_err();
        assert!(error.contains("Claude Code"));
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
