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
    // Required before handing this to `tokio::net::TcpListener::from_std` —
    // tokio refuses to register a blocking-mode fd with its reactor.
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    let token = Uuid::new_v4().to_string();
    Ok((listener, McpBridgeInfo { port, token }))
}

/// Takes the plain `std::net::TcpListener` (not yet adopted by tokio) and
/// converts it here, on first poll — `tokio::net::TcpListener::from_std`
/// registers with the current thread's reactor, which only exists once
/// this future is actually being polled by the tokio runtime. Doing the
/// conversion any earlier (e.g. synchronously inside Tauri's `.setup()`
/// hook, before this task is ever spawned/polled) panics with "there is no
/// reactor running".
pub async fn run(app: AppHandle, std_listener: std::net::TcpListener, token: String) {
    let listener = match tokio::net::TcpListener::from_std(std_listener) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("mcp_bridge: failed to register listener with tokio: {e}");
            return;
        }
    };
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
const RELAYED_TOOLS: &[&str] = &[
    "spawn_sub_agent",
    "list_sub_agents",
    "read_sub_agent",
    "run_action",
    "stop_action",
    "list_actions",
    "read_action",
];

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

#[cfg(test)]
mod tests {
    use super::bind;

    /// Regression test for a real startup panic: tokio refuses (as of
    /// tokio-rs/tokio#7172) to register a still-blocking-mode socket with
    /// its reactor — `bind()` must set the listener non-blocking before
    /// handing it to `tokio::net::TcpListener::from_std`, or this panics.
    #[tokio::test]
    async fn bind_produces_a_listener_tokio_can_register() {
        let (std_listener, _info) = bind().expect("bind should succeed");
        tokio::net::TcpListener::from_std(std_listener)
            .expect("registering the bound listener with tokio must not panic or error");
    }
}
