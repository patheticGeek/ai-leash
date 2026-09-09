use crate::state::AppState;
use base64::{engine::general_purpose, Engine as _};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

pub struct PtyHandle {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

/// Called with each raw output chunk as it's read — `actions.rs` uses this
/// to buffer output for `read_action`/backlog replay; `pty_spawn`'s plain
/// interactive terminals pass `None`.
pub(crate) type PtyDataCallback = Box<dyn Fn(&[u8]) + Send + 'static>;

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<AppState>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
    let mut cmd = CommandBuilder::new(shell);
    cmd.env("TERM", "xterm-256color");
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }
    spawn_pty(&app, &state, cmd, cols, rows, None)
}

/// Spawns an arbitrary command in the project's shell (`$SHELL -c
/// "{command}"`, matching `pty_spawn`'s own shell resolution) — used by
/// `actions.rs` to run a user-defined Action, as opposed to `pty_spawn`'s
/// interactive `$SHELL` with no arguments. Not a terminal tab's doing until
/// one is opened, so there's no real size yet — a fixed default is resized
/// to the real value the same way any terminal already is, via
/// `pty_resize`, once a tab actually mounts.
pub(crate) fn spawn_command_pty(
    app: &AppHandle,
    state: &State<AppState>,
    cwd: Option<String>,
    command: &str,
    on_data: PtyDataCallback,
) -> Result<String, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
    let mut cmd = CommandBuilder::new(shell);
    cmd.env("TERM", "xterm-256color");
    cmd.arg("-c");
    cmd.arg(command);
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }
    spawn_pty(app, state, cmd, 120, 30, Some(on_data))
}

/// Shared by `pty_spawn` (interactive `$SHELL`, no output callback) and
/// `spawn_command_pty` (an Action's fixed command, with a callback that
/// buffers output for `read_action`/backlog replay — see `actions.rs`).
fn spawn_pty(
    app: &AppHandle,
    state: &State<AppState>,
    cmd: CommandBuilder,
    cols: u16,
    rows: u16,
    on_data: Option<PtyDataCallback>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let data_event = format!("pty://{}/data", id);
    let exit_event = format!("pty://{}/exit", id);

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if let Some(cb) = &on_data {
                        cb(&buf[..n]);
                    }
                    let encoded = general_purpose::STANDARD.encode(&buf[..n]);
                    if app_handle.emit(&data_event, encoded).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit(&exit_event, ());
    });

    state.ptys.lock().unwrap().insert(
        id.clone(),
        PtyHandle {
            writer,
            master: pair.master,
            child,
        },
    );
    Ok(id)
}

/// Whether a pty's process is still alive — checked lazily via
/// `try_wait()` rather than tracked via a callback, since a `PtyHandle`
/// stays in `state.ptys` after its process exits on its own (only
/// `pty_kill` removes the entry); `actions.rs` uses this to report
/// accurate running/stopped status even for an Action that crashed or
/// exited by itself.
pub(crate) fn is_running(state: &State<AppState>, id: &str) -> bool {
    let mut ptys = state.ptys.lock().unwrap();
    match ptys.get_mut(id) {
        Some(handle) => matches!(handle.child.try_wait(), Ok(None)),
        None => false,
    }
}

#[tauri::command]
pub fn pty_write(state: State<AppState>, id: String, data: String) -> Result<(), String> {
    let mut ptys = state.ptys.lock().unwrap();
    let handle = ptys.get_mut(&id).ok_or("no such pty")?;
    handle
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    handle.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(state: State<AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let ptys = state.ptys.lock().unwrap();
    let handle = ptys.get(&id).ok_or("no such pty")?;
    handle
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: State<AppState>, id: String) -> Result<(), String> {
    let mut ptys = state.ptys.lock().unwrap();
    if let Some(mut handle) = ptys.remove(&id) {
        let _ = handle.child.kill();
    }
    Ok(())
}
