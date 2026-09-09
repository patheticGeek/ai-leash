use super::{BridgeRequest, BridgeResponse, McpBridgeInfo};
use crate::state::AppState;
use crate::tools;
use std::io;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use uuid::Uuid;

/// Binds a loopback-only listener on an OS-assigned port and mints a
/// per-launch token — the `--mcp-bridge` subprocess (a separate OS process
/// with no access to this app's in-memory state) authenticates relayed tool
/// calls with this token, passed to it only via its own env block.
pub fn bind() -> io::Result<(std::net::TcpListener, McpBridgeInfo)> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let token = Uuid::new_v4().to_string();
    Ok((listener, McpBridgeInfo { port, token }))
}

pub async fn run(app: AppHandle, listener: tokio::net::TcpListener, token: String) {
    loop {
        let Ok((stream, _)) = listener.accept().await else {
            break;
        };
        tokio::spawn(handle_connection(app.clone(), stream, token.clone()));
    }
}

/// One request per connection: a `--mcp-bridge` subprocess dials in, writes
/// one `BridgeRequest` line, reads one `BridgeResponse` line back, and
/// closes — simplest framing that fits the subprocess's own strictly
/// request/response MCP stdio loop (see `client.rs`).
async fn handle_connection(app: AppHandle, stream: TcpStream, token: String) {
    let (read_half, mut write_half) = stream.into_split();
    let mut line = String::new();
    if BufReader::new(read_half)
        .read_line(&mut line)
        .await
        .unwrap_or(0)
        == 0
    {
        return;
    }

    let response = match serde_json::from_str::<BridgeRequest>(&line) {
        Ok(req) if req.token != token => BridgeResponse::Err {
            message: "invalid bridge token".into(),
        },
        Ok(req) => dispatch(&app, &req).await,
        Err(e) => BridgeResponse::Err {
            message: format!("malformed bridge request: {e}"),
        },
    };

    let mut payload = serde_json::to_string(&response).unwrap_or_else(|_| {
        r#"{"status":"err","message":"failed to encode bridge response"}"#.to_string()
    });
    payload.push('\n');
    let _ = write_half.write_all(payload.as_bytes()).await;
}

/// The tool names this bridge is willing to relay from an ACP subprocess —
/// deliberately not the full native tool set (no `read_file`/`shell`/etc,
/// which the ACP agent already has its own equivalents for as a normal ACP
/// client).
const RELAYED_TOOLS: &[&str] = &["spawn_sub_agent", "list_sub_agents", "read_sub_agent"];

async fn dispatch(app: &AppHandle, req: &BridgeRequest) -> BridgeResponse {
    if !RELAYED_TOOLS.contains(&req.name.as_str()) {
        return BridgeResponse::Err {
            message: format!("tool `{}` is not relayed over the bridge", req.name),
        };
    }

    let state = app.state::<AppState>();
    let Some(session) = state
        .acp_sessions
        .lock()
        .unwrap()
        .get(&req.session_id)
        .cloned()
    else {
        return BridgeResponse::Err {
            message: "no active ACP session for this session_id".into(),
        };
    };

    match tools::execute_tool(
        app,
        &state,
        &req.session_id,
        None,
        &session.provider,
        &session.model,
        &req.name,
        &req.arguments,
    )
    .await
    {
        Ok(result) => BridgeResponse::Ok { result },
        Err(message) => BridgeResponse::Err { message },
    }
}
