//! Shared `~/.config/ai-leash` path helpers. `db.rs`, `crashlog.rs`, and
//! `context.rs` each used to hand-roll `dirs::config_dir().join("ai-leash")`
//! plus their own dev/release filename split — one of the three (`context.rs`)
//! quietly missed the split, so a `cargo tauri dev` build and an installed
//! release build shared the same global memory/skills files. Route any new
//! global (not per-project) persistence through here instead.

use std::path::PathBuf;

/// The app's global config directory (`~/.config/ai-leash` on Linux, the
/// platform equivalent elsewhere), created if it doesn't exist yet. Falls
/// back to the system temp dir if the platform config dir can't be resolved
/// at all.
pub fn config_dir() -> PathBuf {
    let dir = dirs::config_dir()
        .map(|d| d.join("ai-leash"))
        .unwrap_or_else(std::env::temp_dir);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Appends `.dev` to `name` in debug builds, leaves it untouched in release —
/// keeps a `cargo tauri dev` build's state separate from an installed
/// release build's, since the two can run side by side and shouldn't share
/// mutable state (same reasoning as `lib.rs`'s identifier suffix).
fn dev_suffixed(name: &str) -> String {
    if cfg!(debug_assertions) {
        format!("{name}.dev")
    } else {
        name.to_string()
    }
}

/// A file directly under `config_dir()`, named `{stem}.dev.{ext}` in debug
/// builds and `{stem}.{ext}` in release.
pub fn versioned_file(stem: &str, ext: &str) -> PathBuf {
    config_dir().join(format!("{}.{ext}", dev_suffixed(stem)))
}

/// A subdirectory of `config_dir()`, named `{name}.dev` in debug builds and
/// `{name}` in release.
pub fn versioned_dir(name: &str) -> PathBuf {
    config_dir().join(dev_suffixed(name))
}
