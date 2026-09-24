use crate::commands;
use crate::state::AppState;
use base64::{engine::general_purpose, Engine as _};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use tauri::{AppHandle, Emitter, Manager, State};
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

/// Called once when the pty's output ends, with the process's exit code if
/// it could be read — `None` if it was killed through `pty_kill` (which
/// removes the handle) or didn't report one in time. `actions.rs` uses this
/// to record how a run ended.
pub(crate) type PtyExitCallback = Box<dyn FnOnce(Option<u32>) + Send + 'static>;

/// Opens in whichever checkout `session_id`'s conversation is pinned to
/// (primary or worktree) — same resolution tools/shell/ACP and Actions
/// already use, via `commands::get_session_root`.
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
    let mut cmd = CommandBuilder::new(shell);
    cmd.env("TERM", "xterm-256color");
    if let Ok(dir) = commands::get_session_root(state.inner(), &session_id) {
        cmd.cwd(dir);
    }
    spawn_pty(&app, &state, cmd, cols, rows, None, None)
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
    on_exit: PtyExitCallback,
) -> Result<String, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
    let mut cmd = CommandBuilder::new(shell);
    cmd.env("TERM", "xterm-256color");
    cmd.arg("-c");
    cmd.arg(command);
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }
    spawn_pty(app, state, cmd, 120, 30, Some(on_data), Some(on_exit))
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
    on_exit: Option<PtyExitCallback>,
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
    // Fires once the reader hits EOF/an error — either the process actually
    // exited, or `pty_kill` closed the pty out from under it, since either
    // way there's nothing left to read. `TerminalPanel.tsx` is the one
    // consumer that cares (an interactive shell going silent with no
    // explanation); it unsubscribes before calling `pty_kill` itself on
    // unmount, same as its `data_event` listener, so a deliberate close
    // never shows a stray "process exited". `ActionTerminalTab.tsx` doesn't
    // listen to this — it gets running/stopped status from the Actions list,
    // which `run.rs` keeps current via `on_exit`.
    let exit_event = format!("pty://{}/exit", id);

    // Registered before the reader starts: a command that exits instantly
    // would otherwise hit EOF before its handle exists, and
    // `wait_for_exit_code` would read "no handle" as "killed".
    state.ptys.lock().unwrap().insert(
        id.clone(),
        PtyHandle {
            writer,
            master: pair.master,
            child,
        },
    );
    let app_handle = app.clone();
    let reader_id = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    // An Action's pty hands its output to `on_data` only —
                    // `run.rs` streams it as offset-addressed `run://output`
                    // instead of this per-pty event (see `actions.rs`).
                    if let Some(cb) = &on_data {
                        cb(&buf[..n]);
                        continue;
                    }
                    let encoded = general_purpose::STANDARD.encode(&buf[..n]);
                    if app_handle.emit(&data_event, encoded).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        if let Some(on_exit) = on_exit {
            on_exit(wait_for_exit_code(&app_handle, &reader_id));
        }
        let _ = app_handle.emit(&exit_event, ());
    });

    Ok(id)
}

/// Once a pty's output has ended, its process has exited or is about to —
/// polls briefly for the exit status rather than blocking in `wait()`, which
/// would need the `ptys` lock held (and `pty_kill` needs it too). `None` if
/// the handle is gone (killed via `pty_kill`) or nothing arrives in ~2s.
fn wait_for_exit_code(app: &AppHandle, id: &str) -> Option<u32> {
    let state = app.state::<AppState>();
    for _ in 0..100 {
        {
            let mut ptys = state.ptys.lock().unwrap();
            let handle = ptys.get_mut(id)?;
            if let Ok(Some(status)) = handle.child.try_wait() {
                return Some(status.exit_code());
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    None
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
