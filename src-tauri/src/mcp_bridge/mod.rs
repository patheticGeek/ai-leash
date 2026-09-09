//! Lets external ACP agent subprocesses call a handful of AI Leash's own
//! tools (sub-agent delegation, memory notes) that they'd otherwise have no
//! way to reach — see `client` (the `--mcp-bridge` subprocess entry point,
//! spoken to by the ACP agent as a stdio MCP server) and `server` (the
//! listener inside the main process that `client` relays sub-agent tool
//! calls back into).

pub mod client;
pub mod server;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PORT_ENV: &str = "AI_LEASH_MCP_PORT";
pub const TOKEN_ENV: &str = "AI_LEASH_MCP_TOKEN";
pub const SESSION_ID_ENV: &str = "AI_LEASH_SESSION_ID";
pub const PROJECT_ROOT_ENV: &str = "AI_LEASH_PROJECT_ROOT";

#[derive(Clone)]
pub struct McpBridgeInfo {
    pub port: u16,
    pub token: String,
}

#[derive(Serialize, Deserialize)]
pub struct BridgeRequest {
    pub token: String,
    pub session_id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BridgeResponse {
    Ok { result: String },
    Err { message: String },
}
