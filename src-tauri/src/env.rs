/// Environment fixups that run before Tauri (and anything it spawns — the
/// built-in `shell` tool, ACP agent subprocesses, and PTYs) starts.
pub fn fix_env() {
    fix_path();
}

/// GUI apps launched outside a terminal (a desktop icon, a dock, `xdg-open`)
/// typically inherit a minimal `PATH` from the display/session manager, not
/// the one a login shell ends up with after sourcing
/// `.bashrc`/`.zshrc`/`.profile` (where things like nvm add their bin
/// directory). That's fine for the app's own binary, but breaks spawning an
/// ACP agent's launch command (`npx ...`, `copilot ...`) whenever the
/// command only exists on the *interactive/login* shell's `PATH` — the
/// "Internal error: ... No such file or directory (os error 2)" users hit
/// is exactly this: the OS couldn't find the binary at all, not an ACP
/// protocol failure. `fix-path-env` (tauri-apps' own crate for exactly this)
/// asks the user's actual shell what its `PATH` is and adopts that for the
/// rest of the process, so every child process spawned afterward sees what
/// a real terminal session would. Best-effort: on failure it just leaves
/// the inherited PATH as-is rather than blocking startup.
fn fix_path() {
    if let Err(e) = fix_path_env::fix() {
        eprintln!("fix_path_env::fix() failed, leaving inherited PATH as-is: {e}");
    }
}
