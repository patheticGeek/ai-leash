use super::{BridgeRequest, BridgeResponse};
use crate::context;
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
            "initialize" => Some(RpcOutcome::Result(initialize_result(&req))),
            "notifications/initialized" => None,
            "tools/list" => Some(RpcOutcome::Result(tools_list_result())),
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

fn initialize_result(req: &Value) -> Value {
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
        "serverInfo": { "name": "ai-leash", "version": env!("CARGO_PKG_VERSION") }
    })
}

fn tools_list_result() -> Value {
    let mut tools = vec![
        json!({
            "name": "spawn_sub_agent",
            "description": "Delegate one or more self-contained subtasks to fresh AI Leash sub-agents, each with its own isolated context. Runs via AI Leash's own configured native provider (not this agent). Each result is appended to AI Leash's Sub Agents tab, and this conversation gets a follow-up message once it's ready.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tasks": {
                        "type": "array",
                        "description": "One entry per independent subtask to run concurrently",
                        "items": {
                            "type": "object",
                            "properties": {
                                "description": { "type": "string", "description": "Short (3-6 word) label for this subtask" },
                                "prompt": { "type": "string", "description": "Full, self-contained instructions for the sub-agent" }
                            },
                            "required": ["description", "prompt"]
                        }
                    }
                },
                "required": ["tasks"]
            }
        }),
        json!({
            "name": "list_sub_agents",
            "description": "List sub-agents spawned from this conversation (running and finished), most recent first.",
            "inputSchema": { "type": "object", "properties": {}, "required": [] }
        }),
        json!({
            "name": "read_sub_agent",
            "description": "Read the full prompt and transcript of one sub-agent spawned from this conversation, by its sub_session_id.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sub_session_id": { "type": "string", "description": "The sub-agent's session id, from list_sub_agents" },
                    "offset": { "type": "integer", "description": "1-based line number to start reading from" },
                    "limit": { "type": "integer", "description": "Maximum number of lines to return. Defaults to 2000." }
                },
                "required": ["sub_session_id"]
            }
        }),
        json!({
            "name": "read_memory",
            "description": "Read AI Leash's persistent memory notes for this project or globally.",
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
            "description": "Add to or update AI Leash's persistent memory notes for this project or globally, shown to its native-provider agent in every future session. Pass the complete new contents, not just an addition — this replaces the whole file.",
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
    // defined yet) — same as tools.rs::tool_definitions — so the agent
    // knows this capability exists and can offer create_action itself.
    tools.push(json!({
        "name": "create_action",
        "description": "Define a new Action: a named background terminal command (e.g. \"dev\" -> \"npm run dev\"), shown in the project's Actions tab and runnable via run_action. Asks the user to approve the command first, same as write_file/edit_file.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": { "type": "string", "description": "Short human-readable name, e.g. \"dev\"" },
                "command": { "type": "string", "description": "The shell command to run in the background, e.g. \"npm run dev\"" }
            },
            "required": ["name", "command"]
        }
    }));
    tools.push(json!({
        "name": "run_action",
        "description": "Start a user-defined background Action by name (see the project's Actions tab, or call list_actions). No permission prompt — the command was already vetted by the user when they defined it. A no-op if it's already running; use stop_action first if you need to restart it.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": { "type": "string", "description": "The Action's name, as shown by list_actions" }
            },
            "required": ["name"]
        }
    }));
    tools.push(json!({
        "name": "stop_action",
        "description": "Stop a running Action by name. A no-op if it isn't running.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": { "type": "string", "description": "The Action's name, as shown by list_actions" }
            },
            "required": ["name"]
        }
    }));
    tools.push(json!({
        "name": "list_actions",
        "description": "List this project's defined Actions and whether each is currently running.",
        "inputSchema": { "type": "object", "properties": {}, "required": [] }
    }));
    tools.push(json!({
        "name": "read_action",
        "description": "Read the recent captured output of an Action that's running or has been run — e.g. to check a dev server's compile output for an error.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": { "type": "string", "description": "The Action's name, as shown by list_actions" }
            },
            "required": ["name"]
        }
    }));

    json!({ "tools": tools })
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
        "update_memory" => update_memory_tool(root, &arguments),
        "spawn_sub_agent" | "list_sub_agents" | "read_sub_agent" | "create_action"
        | "run_action" | "stop_action" | "list_actions" | "read_action" => {
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
