use super::{BridgeRequest, BridgeResponse};
use crate::actions;
use crate::chat_context::{AgentBackend, ChatContext, ChatKind};
use crate::context;
use crate::tools::{
    action_tools, board_tools, chat_info, guidance, guides, memory_tools, sub_agent_tools,
};
use serde_json::{json, Value};
use std::io::{self, BufRead, BufReader, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};

enum RpcOutcome {
    Result(Value),
    Error { code: i64, message: String },
}

/// Entry point for the `--mcp-bridge` subcommand (see `main.rs`) — spawned
/// by an ACP agent as a stdio MCP server (`McpServer::Stdio` in
/// `acp.rs::drive_acp_connection`), giving it access to a handful of AI
/// Leash's own tools it otherwise has no way to reach. Fully synchronous:
/// MCP stdio here is strictly one request in, one response out, so there's
/// no need for a tokio runtime in this short-lived helper process.
pub fn run() {
    let port: u16 = env_var(super::PORT_ENV).parse().unwrap_or(0);
    let token = env_var(super::TOKEN_ENV);
    let session_id = env_var(super::SESSION_ID_ENV);
    let root = PathBuf::from(env_var(super::PROJECT_ROOT_ENV));
    let chat = chat_context(&root);

    let stdin = io::stdin();
    let mut out = io::stdout();

    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(req) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let id = req.get("id").cloned();
        let method = req.get("method").and_then(Value::as_str).unwrap_or("");

        let outcome = match method {
            "initialize" => Some(RpcOutcome::Result(initialize_result(&req, &root, &chat))),
            "notifications/initialized" => None,
            "tools/list" => Some(RpcOutcome::Result(tools_list_result(&root, &chat))),
            "tools/call" => Some(tools_call_result(
                &req,
                port,
                &token,
                &session_id,
                &root,
                &chat,
            )),
            _ => id.as_ref().map(|_| RpcOutcome::Error {
                code: -32601,
                message: format!("method not found: {method}"),
            }),
        };

        // Notifications (no `id`, e.g. `notifications/initialized`) get no
        // response at all per JSON-RPC — `outcome` is `None` for those.
        let (Some(id), Some(outcome)) = (id, outcome) else {
            continue;
        };
        let response = match outcome {
            RpcOutcome::Result(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            RpcOutcome::Error { code, message } => {
                json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
            }
        };
        let _ = writeln!(out, "{response}");
        let _ = out.flush();
    }
}

fn env_var(name: &str) -> String {
    std::env::var(name).unwrap_or_default()
}

/// The `ChatContext` the app handed over (`CHAT_CONTEXT_ENV`), or a plain
/// chat in `root` if it's missing — e.g. a bridge spawned by an older build.
fn chat_context(root: &Path) -> ChatContext {
    serde_json::from_str(&env_var(super::CHAT_CONTEXT_ENV)).unwrap_or_else(|_| {
        let root = root.display().to_string();
        ChatContext {
            kind: ChatKind::Plain,
            backend: AgentBackend::Acp,
            project_name: Path::new(&root)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&root)
                .to_string(),
            in_worktree: false,
            project_root: root,
        }
    })
}

fn initialize_result(req: &Value, root: &Path, chat: &ChatContext) -> Value {
    // Just agree to whatever protocol version the agent asked for — this
    // server only relies on the `tools/list`/`tools/call` baseline, which
    // has been stable across MCP protocol revisions.
    let protocol_version = req
        .get("params")
        .and_then(|p| p.get("protocolVersion"))
        .and_then(Value::as_str)
        .unwrap_or("2024-11-05");
    json!({
        "protocolVersion": protocol_version,
        "capabilities": { "tools": {} },
        "serverInfo": { "name": "ai-leash", "version": env!("CARGO_PKG_VERSION") },
        "instructions": bridge_instructions(root, chat)
    })
}

/// Offered to every chat but sub-agents, which can't spawn their own.
const SUB_AGENT_TOOLS: &[&str] = &[
    "spawn_sub_agent",
    "list_sub_agents",
    "read_sub_agent",
    "list_agent_options",
];

fn tools_list_result(root: &Path, chat: &ChatContext) -> Value {
    let mut tools = vec![];
    if chat.allows_sub_agents() {
        tools.extend(
            [
                sub_agent_tools::spawn_sub_agent_def(),
                sub_agent_tools::list_sub_agents_def(),
                sub_agent_tools::read_sub_agent_def(),
                sub_agent_tools::list_agent_options_def(),
            ]
            .into_iter()
            .map(mcp_tool),
        );
    }
    tools.extend([
        json!({
            "name": "read_memory",
            "description": "Read AI Leash's persistent memory notes for this project or globally. Unlike AI Leash's native-provider agent, these aren't injected into your context automatically — call this yourself at the start of a task in this project (and before update_memory, which replaces the whole file).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "scope": { "type": "string", "enum": ["project", "global"], "description": "\"project\" for notes specific to this project, \"global\" for notes that apply across all projects" }
                },
                "required": ["scope"]
            }
        }),
        json!({
            "name": "update_memory",
            "description": "Add to or update AI Leash's persistent memory notes for this project or globally, shown to its native-provider agent in every future session. Pass the complete new contents, not just an addition — this replaces the whole file, so call read_memory first and merge. Call it on your own as soon as the user states a lasting preference or corrects you in a way that should apply next time; don't wait to be asked.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "scope": { "type": "string", "enum": ["project", "global"] },
                    "content": { "type": "string", "description": "The complete new markdown contents of the memory file for this scope" }
                },
                "required": ["scope", "content"]
            }
        }),
    ]);

    // Always advertised (not gated on whether the project has any Actions
    // defined yet) — same as `tools::tool_definitions` — so the agent
    // knows this capability exists and can offer create_action itself.
    tools.extend(action_tools::action_defs().into_iter().map(mcp_tool));
    tools.extend(
        board_tools::board_defs_for(&chat.kind)
            .into_iter()
            .map(mcp_tool),
    );
    tools.push(mcp_tool(guides::read_guide_def()));
    tools.push(mcp_tool(chat_info::chat_info_def()));

    // Gated like the native list: only worth a tool slot if there's a skill
    // to load. A snapshot from connect time, same as the instructions' count.
    if !context::list_skills(root, &[]).is_empty() {
        tools.push(mcp_tool(list_skills_def()));
        tools.push(mcp_tool(memory_tools::load_skill_def()));
    }

    json!({ "tools": tools })
}

/// Bridge guidance plus how many Actions and skills this project has, with
/// the tool that lists each. Only counts, not the lists themselves: Claude
/// Code cuts `instructions` off at about 4K characters, so the whole text
/// is kept under `INSTRUCTIONS_BUDGET` however many there are. Snapshots
/// from connect time; the tools give the live set.
fn bridge_instructions(root: &Path, chat: &ChatContext) -> String {
    instructions_for(
        chat,
        actions::load_actions(root).len(),
        context::list_skills(root, &[]).len(),
    )
}

/// Well under where Claude Code truncates (about 4,096 characters).
#[cfg(test)]
const INSTRUCTIONS_BUDGET: usize = 3_000;

fn instructions_for(chat: &ChatContext, actions: usize, skills: usize) -> String {
    let mut out = guidance::guidance(chat);
    let mut lines = vec![];
    if actions > 0 {
        lines.push(format!(
            "- {actions} Action{} defined; `list_actions` shows them.",
            if actions == 1 { " is" } else { "s are" }
        ));
    }
    if skills > 0 {
        lines.push(format!(
            "- {skills} skill{} available; `list_skills` shows them, `load_skill` loads one.",
            if skills == 1 { " is" } else { "s are" }
        ));
    }
    if !lines.is_empty() {
        out.push_str("\n\n# In this project\n\n");
        out.push_str(&lines.join("\n"));
    }
    out
}

/// The skills' names and descriptions, which the native agent gets in its
/// system prompt; the bridge's instructions only count them.
fn list_skills_def() -> Value {
    json!({
        "name": "list_skills",
        "description": "List the skills available in this project (its own and the user's global ones): each one's name and what it's for. Load one with load_skill when it's relevant to the task.",
        "parameters": { "type": "object", "properties": {}, "required": [] }
    })
}

fn list_skills_tool(root: &Path) -> Result<String, String> {
    Ok(context::skills_section(&context::list_skills(root, &[]))
        .unwrap_or_else(|| "There are no skills available in this project.".to_string()))
}

fn mcp_tool(mut definition: Value) -> Value {
    let parameters = definition
        .as_object_mut()
        .and_then(|object| object.remove("parameters"))
        .unwrap_or_else(|| json!({ "type": "object", "properties": {}, "required": [] }));
    if let Some(object) = definition.as_object_mut() {
        object.insert("inputSchema".to_string(), parameters);
    }
    definition
}

fn tools_call_result(
    req: &Value,
    port: u16,
    token: &str,
    session_id: &str,
    root: &Path,
    chat: &ChatContext,
) -> RpcOutcome {
    let params = req.get("params").cloned().unwrap_or(Value::Null);
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let outcome: Result<String, String> = match name {
        sub if SUB_AGENT_TOOLS.contains(&sub) && !chat.allows_sub_agents() => {
            Err("sub-agents can't spawn or manage sub-agents of their own".to_string())
        }
        "read_memory" => read_memory_tool(root, &arguments),
        "load_skill" => load_skill_tool(root, &arguments),
        "list_skills" => list_skills_tool(root),
        "read_guide" => guides::read_guide(&arguments),
        "update_memory" => update_memory_tool(root, &arguments),
        "spawn_sub_agent" | "list_sub_agents" | "read_sub_agent" | "list_agent_options"
        | "create_action" | "run_action" | "stop_action" | "list_actions" | "read_action"
        // Live from the app: the env-var context is a connect-time snapshot.
        | "chat_info" => {
            relay_over_tcp(port, token, session_id, name, arguments)
        }
        board if board_tools::BOARD_TOOLS.contains(&board) => {
            match board_tools::refusal(&chat.kind, board) {
                Some(why) => Err(why),
                None => relay_over_tcp(port, token, session_id, name, arguments),
            }
        }
        other => Err(format!("unknown tool `{other}`")),
    };

    // Tool-execution failures are a *successful* JSON-RPC response shaped
    // as `isError: true`, per MCP convention — a JSON-RPC-level error is
    // reserved for protocol failures (unknown method, malformed request),
    // not a tool doing something the model asked wrong.
    match outcome {
        Ok(text) => RpcOutcome::Result(json!({
            "content": [{ "type": "text", "text": text }],
            "isError": false
        })),
        Err(message) => RpcOutcome::Result(json!({
            "content": [{ "type": "text", "text": message }],
            "isError": true
        })),
    }
}

/// `update_memory`/`read_memory` need no permission-popup gating the way
/// the native `update_memory` tool has (`request_permission` in tools.rs) —
/// this subprocess is spoken to by the ACP agent itself, which already has
/// unrestricted filesystem access to this exact path via its own tools (or
/// a shell command) regardless of what AI Leash does here. The MCP tool is
/// a discoverability/convenience surface, not a security boundary.
fn read_memory_tool(root: &Path, args: &Value) -> Result<String, String> {
    let global = args.get("scope").and_then(Value::as_str) == Some("global");
    let path = context::memory_path(root, global).ok_or("could not resolve memory path")?;
    Ok(std::fs::read_to_string(&path).unwrap_or_default())
}

fn update_memory_tool(root: &Path, args: &Value) -> Result<String, String> {
    let global = args.get("scope").and_then(Value::as_str) == Some("global");
    let content = args
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let path = context::memory_path(root, global).ok_or("could not resolve memory path")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok("Memory updated.".to_string())
}

fn load_skill_tool(root: &Path, args: &Value) -> Result<String, String> {
    let name = args
        .get("name")
        .and_then(Value::as_str)
        .ok_or("missing `name`")?;
    context::load_skill_body(root, &[], name).ok_or_else(|| {
        let available: Vec<String> = context::list_skills(root, &[])
            .into_iter()
            .map(|s| s.name)
            .collect();
        if available.is_empty() {
            format!("No skill named `{name}` found; there are no skills available in this project.")
        } else {
            format!(
                "No skill named `{name}` found. Available skills: {}.",
                available.join(", ")
            )
        }
    })
}

/// Relays a tool call the subprocess can't execute itself (it needs the
/// main process's live `AppState`/DB/window) over the loopback bridge —
/// see `server::handle_connection`. One TCP connection per call: dial,
/// write one `BridgeRequest` line, read one `BridgeResponse` line, close.
fn relay_over_tcp(
    port: u16,
    token: &str,
    session_id: &str,
    name: &str,
    arguments: Value,
) -> Result<String, String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .map_err(|e| format!("bridge connect failed: {e}"))?;
    let req = BridgeRequest {
        token: token.to_string(),
        session_id: session_id.to_string(),
        name: name.to_string(),
        arguments,
    };
    let mut payload = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    payload.push('\n');
    stream
        .write_all(payload.as_bytes())
        .map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())?;

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).map_err(|e| e.to_string())?;
    match serde_json::from_str::<BridgeResponse>(&line).map_err(|e| e.to_string())? {
        BridgeResponse::Ok { result } => Ok(result),
        BridgeResponse::Err { message } => Err(message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat_context::AgentBackend;

    fn kinds() -> Vec<ChatKind> {
        vec![
            ChatKind::Plain,
            ChatKind::Project,
            ChatKind::Task {
                number: 12345,
                title: "A fairly long task title, as titles on a real board tend to get".into(),
            },
            ChatKind::SubAgent { parent: "p".into() },
        ]
    }

    #[test]
    fn worst_case_instructions_stay_under_budget() {
        for kind in kinds() {
            let chat = ChatContext {
                kind: kind.clone(),
                backend: AgentBackend::Acp,
                project_name: "some-project-with-a-long-name".into(),
                project_root: "/home/someone/Projects/some-project-with-a-long-name".into(),
                in_worktree: true,
            };
            let text = instructions_for(&chat, 250, 250);
            let len = text.chars().count();
            assert!(len < INSTRUCTIONS_BUDGET, "{kind:?}: {len} chars\n{text}");
            assert!(text.contains("250 Actions are defined; `list_actions`"));
            assert!(text.contains("250 skills are available; `list_skills`"));
            assert!(text.contains("`read_guide`"));
            assert!(text.contains("`chat_info`"));
        }
    }

    #[test]
    fn nothing_to_count_adds_no_section() {
        let chat = chat_context(Path::new("/tmp/x"));
        assert!(!instructions_for(&chat, 0, 0).contains("# In this project"));
        let one = instructions_for(&chat, 1, 1);
        assert!(one.contains("1 Action is defined"));
        assert!(one.contains("1 skill is available"));
    }

    #[test]
    fn read_guide_is_always_offered_and_answered_locally() {
        let root = Path::new("/nonexistent/ai-leash-test");
        let chat = chat_context(root);
        let list = tools_list_result(root, &chat);
        let names: Vec<&str> = list["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert!(names.contains(&"read_guide"));
        assert!(!names.contains(&"list_skills"));
        let req = json!({ "params": { "name": "read_guide", "arguments": { "topic": "board" } } });
        // Port 0: a relayed call would fail, so this proves it's local.
        let RpcOutcome::Result(r) = tools_call_result(&req, 0, "", "", root, &chat) else {
            panic!("expected a result");
        };
        assert_eq!(r["isError"], false);
        assert!(r["content"][0]["text"]
            .as_str()
            .unwrap()
            .starts_with("# The board"));
    }

    fn with_kind(kind: ChatKind) -> ChatContext {
        ChatContext {
            kind,
            ..chat_context(Path::new("/nonexistent/ai-leash-test"))
        }
    }

    #[test]
    fn board_tools_listed_per_chat_kind() {
        let root = Path::new("/nonexistent/ai-leash-test");
        for kind in kinds() {
            let list = tools_list_result(root, &with_kind(kind.clone()));
            let board: Vec<&str> = list["tools"]
                .as_array()
                .unwrap()
                .iter()
                .map(|t| t["name"].as_str().unwrap())
                .filter(|n| board_tools::BOARD_TOOLS.contains(n))
                .collect();
            assert_eq!(board, board_tools::board_tools_for(&kind), "{kind:?}");
            assert_eq!(
                board.contains(&"start_task"),
                kind == ChatKind::Project,
                "{kind:?}"
            );
        }
    }

    #[test]
    fn chat_info_is_listed_for_every_kind_and_relayed() {
        let root = Path::new("/nonexistent/ai-leash-test");
        for kind in kinds() {
            let chat = with_kind(kind.clone());
            let list = tools_list_result(root, &chat);
            assert!(
                list["tools"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|t| t["name"] == "chat_info"),
                "{kind:?}"
            );
            // Relayed, not answered from the connect-time snapshot: port 0
            // makes the relay fail.
            let req = json!({ "params": { "name": "chat_info", "arguments": {} } });
            let RpcOutcome::Result(r) = tools_call_result(&req, 0, "", "", root, &chat) else {
                panic!("expected a result");
            };
            let text = r["content"][0]["text"].as_str().unwrap();
            assert!(
                text.starts_with("bridge connect failed"),
                "{kind:?}: {text}"
            );
        }
    }

    #[test]
    fn a_stale_board_tool_call_is_refused_locally() {
        let root = Path::new("/nonexistent/ai-leash-test");
        let call = |kind: ChatKind, name: &str| {
            let req = json!({ "params": { "name": name, "arguments": { "task": "#1" } } });
            // Port 0: a relayed call fails with "bridge connect failed".
            let RpcOutcome::Result(r) = tools_call_result(&req, 0, "", "", root, &with_kind(kind))
            else {
                panic!("expected a result");
            };
            (
                r["isError"].as_bool().unwrap(),
                r["content"][0]["text"].as_str().unwrap().to_string(),
            )
        };
        let task = kinds()[2].clone();
        let (err, text) = call(task, "start_task");
        assert!(err);
        assert!(
            text.contains("can only be used from the project chat"),
            "{text}"
        );
        let sub = ChatKind::SubAgent { parent: "p".into() };
        let (err, text) = call(sub.clone(), "update_task");
        assert!(err);
        assert!(text.contains("can't be used by a sub-agent"), "{text}");
        // An allowed one goes on to the relay.
        let (_, text) = call(sub, "read_task");
        assert!(text.starts_with("bridge connect failed"), "{text}");
        let (_, text) = call(ChatKind::Project, "start_task");
        assert!(text.starts_with("bridge connect failed"), "{text}");
    }
}
