mod acp;
mod actions;
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

    // `enableGTKAppId` registers this app's GTK application under
    // `identifier` as a *unique* D-Bus name (tao creates it without
    // `NON_UNIQUE`). A `cargo tauri dev` build normally shares that same
    // identifier with an already-installed release build, so launching dev
    // just sends an `activate` signal to the running release instance
    // instead of opening its own window — and that re-entrant activate
    // panics Tauri's setup (`a webview with label main already exists`),
    // crashing the instance you were actually using. Suffixing the
    // identifier in debug builds gives dev its own D-Bus name so the two
    // can coexist.
    let mut context = tauri::generate_context!();
    if cfg!(debug_assertions) {
        context.config_mut().identifier.push_str(".dev");
        for window in &mut context.config_mut().app.windows {
            window.title.push_str(" (dev)");
        }
    }

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
            tauri::async_runtime::spawn(mcp_bridge::server::run(
                app.handle().clone(),
                std_listener,
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
            chat::history::load_conversation_history,
            chat::history::set_message_duration,
            chat::history::get_conversation_title,
            chat::history::set_conversation_title,
            chat::clear_conversation,
            chat::compact_conversation,
            chat::history::list_sub_agents,
            chat::history::delete_sub_agent,
            chat::history::list_conversations,
            chat::history::delete_conversation,
            tools::permissions::respond_permission,
            tools::permissions::set_permission_mode,
            tools::shell_tools::run_shell_command,
            acp::warm_acp_session,
            acp::send_prompt_acp,
            acp::set_acp_model,
            acp::set_acp_effort,
            acp::fetch_acp_models,
            actions::list_actions,
            actions::create_action,
            actions::update_action,
            actions::delete_action,
            actions::run_action_cmd,
            actions::stop_action_cmd,
            actions::action_backlog,
            crashlog::report_frontend_crash,
            crashlog::get_crash_log,
            crashlog::clear_crash_log,
        ])
        .build(context)
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Kill every still-running Action's process when AI Leash
            // exits — otherwise a `npm run dev`-style background process
            // the user forgot about would keep running invisibly. Ordinary
            // interactive terminal ptys are left alone (unchanged
            // pre-existing behavior): only Actions get this treatment
            // since they're the ones meant to run unattended.
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<AppState>();
                let pty_ids: Vec<String> = state
                    .action_runs
                    .lock()
                    .unwrap()
                    .values()
                    .map(|run| run.pty_id.clone())
                    .collect();
                for id in pty_ids {
                    let _ = pty::pty_kill(state.clone(), id);
                }
            }
        });
}
