// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--mcp-bridge") {
        ai_leash_lib::mcp_bridge::client::run();
        return;
    }
    ai_leash_lib::run()
}
