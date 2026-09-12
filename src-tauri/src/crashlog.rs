use std::io::Write;
use std::path::PathBuf;

/// Best-effort cap so a long-lived install doesn't grow this file forever —
/// starting fresh once it's exceeded is simpler than real rotation, and
/// fine for a debugging aid rather than an audit log.
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;

fn log_path() -> PathBuf {
    // Same directory/fallback convention as `db.rs`'s `db_path()`, including
    // the debug-build filename split — a `cargo tauri dev` build and an
    // installed release build run side by side and shouldn't share this.
    let dir = dirs::config_dir()
        .map(|d| d.join("ai-leash"))
        .unwrap_or_else(std::env::temp_dir);
    let _ = std::fs::create_dir_all(&dir);
    let filename = if cfg!(debug_assertions) {
        "crash.dev.log"
    } else {
        "crash.log"
    };
    dir.join(filename)
}

fn unix_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn append_capped(path: &std::path::Path, entry: &str, max_bytes: u64) {
    if std::fs::metadata(path).map(|m| m.len()).unwrap_or(0) > max_bytes {
        let _ = std::fs::remove_file(path);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(file, "{entry}\n");
    }
}

fn append(entry: &str) {
    append_capped(&log_path(), entry, MAX_LOG_BYTES);
}

/// Installs a panic hook that appends every panic (message, location, and a
/// forced backtrace) to a durable log file before the process unwinds or
/// aborts. Matters because `Cargo.toml`'s `[profile.release]` sets `panic =
/// "abort"` — every panic anywhere in the process (including inside a
/// detached `tokio::spawn`ed task, e.g. an ACP connection actor or a
/// sub-agent run) immediately kills the whole app with no unwinding at all.
/// Without this, a packaged build's crash leaves nothing behind: no
/// terminal (GUI apps don't have one), no SQLite write, nothing — the user
/// just sees the window vanish. Call as early as possible in `run()`, before
/// anything else that could itself panic. Chains to whatever hook was
/// already installed (the Rust default one), so `cargo tauri dev`'s normal
/// terminal output is unaffected.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let backtrace = std::backtrace::Backtrace::force_capture();
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown location>".to_string());
        let message = panic_message(info);
        append(&format!(
            "=== backend panic at unix:{} ===\nlocation: {location}\nmessage: {message}\nbacktrace:\n{backtrace}",
            unix_timestamp(),
        ));
        previous(info);
    }));
}

fn panic_message(info: &std::panic::PanicHookInfo<'_>) -> String {
    if let Some(s) = info.payload().downcast_ref::<&str>() {
        s.to_string()
    } else if let Some(s) = info.payload().downcast_ref::<String>() {
        s.clone()
    } else {
        "<non-string panic payload>".to_string()
    }
}

fn frontend_crash_entry(kind: &str, message: &str, stack: Option<&str>) -> String {
    let mut entry = format!(
        "=== frontend {kind} at unix:{} ===\nmessage: {message}",
        unix_timestamp()
    );
    if let Some(stack) = stack {
        entry.push_str(&format!("\nstack:\n{stack}"));
    }
    entry
}

/// Appends a frontend-reported crash (an uncaught error, an unhandled
/// promise rejection, or a React error boundary catch — see `main.tsx`) to
/// the same file, so both halves of the app land in one place to debug from.
pub fn log_frontend_crash(kind: &str, message: &str, stack: Option<&str>) {
    append(&frontend_crash_entry(kind, message, stack));
}

#[tauri::command]
pub fn report_frontend_crash(kind: String, message: String, stack: Option<String>) {
    log_frontend_crash(&kind, &message, stack.as_deref());
}

/// For the in-app crash log viewer — empty string if nothing's crashed.
#[tauri::command]
pub fn get_crash_log() -> String {
    std::fs::read_to_string(log_path()).unwrap_or_default()
}

/// Used by the viewer's "clear" action so old entries don't linger once
/// they've been read.
#[tauri::command]
pub fn clear_crash_log() {
    let _ = std::fs::remove_file(log_path());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_log_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "ai-leash-test-crashlog-{}.log",
            uuid::Uuid::new_v4()
        ))
    }

    #[test]
    fn appends_entries_without_overwriting_earlier_ones() {
        let path = temp_log_path();
        append_capped(&path, "first entry", 1024);
        append_capped(&path, "second entry", 1024);
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("first entry"));
        assert!(content.contains("second entry"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn resets_once_the_size_cap_is_exceeded() {
        let path = temp_log_path();
        append_capped(&path, "a long entry that blows well past a tiny cap", 5);
        append_capped(&path, "fresh entry after reset", 5);
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(!content.contains("blows well past"));
        assert!(content.contains("fresh entry after reset"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn frontend_crash_entry_includes_kind_message_and_stack() {
        let entry = frontend_crash_entry("error", "boom", Some("at foo.js:1:1"));
        assert!(entry.contains("frontend error"));
        assert!(entry.contains("boom"));
        assert!(entry.contains("at foo.js:1:1"));
    }

    #[test]
    fn frontend_crash_entry_omits_stack_section_when_absent() {
        let entry = frontend_crash_entry("unhandledrejection", "boom", None);
        assert!(!entry.contains("stack:"));
    }
}
