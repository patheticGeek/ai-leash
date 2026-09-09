mod acp;
mod chat;
mod commands;
mod context;
mod crashlog;
mod db;
mod env;
pub mod mcp_bridge;
mod provider;
mod pty;
mod state;
mod tools;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // First thing, before anything else that could itself panic — see the
    // doc comment on `install_panic_hook` for why this can't wait.
    crashlog::install_panic_hook();
    env::fix_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            // Loopback listener external ACP agent subprocesses relay a
            // handful of tool calls through — see `mcp_bridge` and
            // `acp.rs::drive_acp_connection`, which attaches it to each ACP
            // session's `NewSessionRequest.mcp_servers`.
            let (std_listener, info) = mcp_bridge::server::bind()?;
            *app.state::<AppState>().mcp_bridge.lock().unwrap() = Some(info.clone());
            let listener = tokio::net::TcpListener::from_std(std_listener)?;
            tauri::async_runtime::spawn(mcp_bridge::server::run(
                app.handle().clone(),
                listener,
                info.token,
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_project_root,
            commands::get_project_root,
            commands::list_dir,
            commands::read_file_text,
            commands::write_file_text,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            provider::list_provider_models,
            provider::check_provider_connection,
            chat::send_prompt,
            chat::retry_last,
            chat::cancel_prompt,
            chat::load_conversation_history,
            chat::clear_conversation,
            chat::compact_conversation,
            chat::list_sub_agents,
            chat::delete_sub_agent,
            tools::respond_permission,
            tools::set_permission_mode,
            tools::run_shell_command,
            acp::send_prompt_acp,
            acp::set_acp_model,
            acp::fetch_acp_models,
            crashlog::report_frontend_crash,
            crashlog::get_crash_log,
            crashlog::clear_crash_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
