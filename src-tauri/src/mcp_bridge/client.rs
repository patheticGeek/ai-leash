use super::{BridgeRequest, BridgeResponse};
use crate::actions;
use crate::context;
use crate::tools::{action_tools, guidance, memory_tools, sub_agent_tools};
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
            "initialize" => Some(RpcOutcome::Result(initialize_result(&req, &root))),
            "notifications/initialized" => None,
            "tools/list" => Some(RpcOutcome::Result(tools_list_result(&root))),
            "tools/call" => Some(tools_call_result(&req, port, &token, &session_id, &root)),
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

fn initialize_result(req: &Value, root: &Path) -> Value {
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
        "instructions": bridge_instructions(root)
    })
}

fn tools_list_result(root: &Path) -> Value {
    let mut tools = vec![
        mcp_tool(sub_agent_tools::spawn_sub_agent_def()),
        mcp_tool(sub_agent_tools::list_sub_agents_def()),
        mcp_tool(sub_agent_tools::read_sub_agent_def()),
        mcp_tool(sub_agent_tools::list_agent_options_def()),
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
    ];

    // Always advertised (not gated on whether the project has any Actions
    // defined yet) — same as `tools::tool_definitions` — so the agent
    // knows this capability exists and can offer create_action itself.
    tools.extend(action_tools::action_defs().into_iter().map(mcp_tool));

    // Gated like the native list: only worth a tool slot if there's a skill
    // to load. A snapshot from connect time, same as the instructions' list.
    if !context::list_skills(root, &[]).is_empty() {
        tools.push(mcp_tool(memory_tools::load_skill_def()));
    }

    json!({ "tools": tools })
}

/// Bridge guidance plus what already exists in this project — the defined
/// Actions and available skills — so the agent doesn't have to spend a call
/// discovering them. Snapshots from connect time; the guidance points at
/// `list_actions` for the live set.
fn bridge_instructions(root: &Path) -> String {
    let mut sections = vec![guidance::bridge_instructions()];
    sections.extend(context::actions_section(&actions::load_actions(root)));
    sections.extend(context::skills_section(&context::list_skills(root, &[])));
    sections.join("\n\n")
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
        "read_memory" => read_memory_tool(root, &arguments),
        "load_skill" => load_skill_tool(root, &arguments),
        "update_memory" => update_memory_tool(root, &arguments),
        "spawn_sub_agent" | "list_sub_agents" | "read_sub_agent" | "list_agent_options"
        | "create_action" | "run_action" | "stop_action" | "list_actions" | "read_action" => {
            relay_over_tcp(port, token, session_id, name, arguments)
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
