/// Environment fixups that only matter once, before Tauri (and anything it
/// spawns — the built-in `shell` tool, ACP agent subprocesses, PTYs) starts.
/// Both problems below stem from the same root cause: a process launched
/// outside a real terminal session (a desktop icon, an AppImage's own mount
/// wrapper) doesn't have the environment a login shell would, and child
/// processes inherit whatever we have.
pub fn fix_env() {
    fix_path();
    strip_appimage_ld_library_path();
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

/// The AppImage runtime mounts its bundled squashfs and points
/// `LD_LIBRARY_PATH` at its own `usr/lib` (confirmed directly against a
/// real build's `AppRun` — it's `<mount-dir>/usr/lib/:<mount-dir>/usr/lib/
/// x86_64-linux-gnu/:...`, i.e. subdirectories of the same root our own
/// binary is running from) so the app binary can find its ~155 bundled
/// shared libraries (GTK/WebKit and everything under them — glib, cairo,
/// pango, icu, krb5, nghttp2, sqlite3, libxml2, zstd, and more, several of
/// which plenty of ordinary CLI tools also happen to link against, not
/// just `libpcre2-8.so.0`). That variable is inherited by every child
/// process we spawn too, including totally unrelated system binaries
/// (`git`, anything run via the `shell` tool, ACP agents) — those then
/// load the AppImage's bundled lib instead of their own system one, which
/// is usually just a noisy "no version information available" warning but
/// can be a real ABI mismatch or crash for a big enough version gap.
///
/// Rather than trust the `APPIMAGE` env var the AppImage runtime is
/// documented to set (couldn't independently confirm it's actually set in
/// this build without also risking flashing a real GTK window mid-startup
/// to catch it — `strace` isn't available here either), this checks the
/// one thing we *did* confirm directly: whether `LD_LIBRARY_PATH` actually
/// points somewhere under our own executable's directory. That's true
/// precisely when it's AppImage-injected pointing at our own bundle, and
/// never true for a `.deb`/`.rpm` install or `tauri dev` — so this is
/// self-gating without depending on any external convention. Our own
/// process already finished loading its shared libraries before this runs
/// (that happens before `main()`), so removing it here only affects
/// subprocesses spawned from this point on.
fn strip_appimage_ld_library_path() {
    let Ok(ld_library_path) = std::env::var("LD_LIBRARY_PATH") else {
        return;
    };
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    // `usr/bin/<binary>` and `usr/lib/` share the AppDir root two levels up.
    let Some(app_dir) = exe.parent().and_then(|p| p.parent()) else {
        return;
    };
    if is_appimage_injected(&ld_library_path, app_dir) {
        // SAFETY: called once, synchronously, before Tauri (and any of its
        // threads) starts — no concurrent env access yet.
        unsafe { std::env::remove_var("LD_LIBRARY_PATH") };
    }
}

/// Pure decision logic, separated from the real env/exe-path reads above so
/// it's directly testable with made-up paths instead of mutating real
/// process state.
fn is_appimage_injected(ld_library_path: &str, app_dir: &std::path::Path) -> bool {
    std::env::split_paths(ld_library_path).any(|entry| entry.starts_with(app_dir))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn detects_ld_library_path_pointing_into_the_app_bundle() {
        let app_dir = Path::new("/tmp/.mount_ai-leaOmKBEl");
        let ld_library_path = "/tmp/.mount_ai-leaOmKBEl/usr/lib/:/tmp/.mount_ai-leaOmKBEl/usr/lib/x86_64-linux-gnu/:/usr/lib";
        assert!(is_appimage_injected(ld_library_path, app_dir));
    }

    #[test]
    fn leaves_an_unrelated_ld_library_path_alone() {
        let app_dir = Path::new("/tmp/.mount_ai-leaOmKBEl");
        assert!(!is_appimage_injected(
            "/usr/local/lib:/opt/some-other-app/lib",
            app_dir
        ));
    }

    #[test]
    fn treats_an_empty_ld_library_path_as_unrelated() {
        let app_dir = Path::new("/tmp/.mount_ai-leaOmKBEl");
        assert!(!is_appimage_injected("", app_dir));
    }
}
