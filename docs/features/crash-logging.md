# Crash logging

A packaged desktop build has no terminal — if the backend panics or a
frontend error goes uncaught, the window just vanishes with nothing
visible anywhere to explain why (compounded on Linux by `[profile.release]`
setting `panic = "abort"`: *any* panic anywhere in the process, including
inside a detached `tokio::spawn`ed task like an ACP connection actor,
immediately kills the whole app with no unwinding at all). This exists so a
crash always leaves something behind to debug from, on both sides.

## Backend (`src-tauri/src/crashlog.rs`)

`install_panic_hook()` is called first thing in `run()` (`lib.rs`), before
anything else that could itself panic. It installs a `std::panic::set_hook`
that appends the panic's message, source location, and a forced backtrace
(`std::backtrace::Backtrace::force_capture()` — ignores `RUST_BACKTRACE`,
always captures) to a log file, then chains to whatever hook was already
installed (Rust's default one), so `cargo tauri dev`'s normal terminal
output is unaffected.

The log file lives at `dirs::config_dir()/ai-leash/crash.log` (same
directory/fallback convention as `db.rs`'s `db_path()` — falls back to
`std::env::temp_dir()` if `config_dir()` can't resolve), capped at 5 MiB:
once exceeded, the next write starts the file fresh rather than attempting
real rotation — this is a debugging aid, not an audit log.

## Frontend (`src/lib/crashReporting.ts`, `src/components/ErrorBoundary.tsx`)

Three failure modes, all forwarded to the *same* backend log file via the
new `report_frontend_crash` command (so both halves of the app land in one
place to debug from):

- `window.addEventListener("error", ...)` — an uncaught exception outside
  React's render cycle (event handlers, timers, non-React DOM code).
- `window.addEventListener("unhandledrejection", ...)` — a rejected
  promise nobody attached a `.catch` to.
- `ErrorBoundary`'s `componentDidCatch` — a render-time crash anywhere in
  the tree, which `main.tsx` wraps the whole app in. Without this, a
  render crash white-screens the app with nothing on screen to explain why;
  the boundary instead shows a minimal fallback (the error message, a
  pointer to Settings → Crash log, and a reload button) and reports the
  error before rendering it.

Both `installCrashReporting()` (the two `window` listeners) and the
boundary are best-effort and fire-and-forget — `crashReporting.ts`'s
`report()` swallows the report call's own promise rejection, since a crash
handler that can itself throw defeats the point.

## Viewing it (`SettingsModal.tsx`'s "Crash log" section)

`get_crash_log`/`clear_crash_log` (also in `crashlog.rs`) back a small
viewer in Settings — the file's full contents in a scrollable `<pre>`,
plus refresh/copy/clear actions. This is what makes a crash actually
debuggable after an app restart without needing terminal access at all:
reopen the app, open Settings, read (or copy) what happened last time.
