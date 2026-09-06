mod chat;
mod commands;
mod context;
mod db;
mod pty;
mod state;
mod tools;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
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
            chat::list_ollama_models,
            chat::send_prompt,
            chat::retry_last,
            chat::cancel_prompt,
            chat::load_conversation_history,
            tools::respond_permission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
