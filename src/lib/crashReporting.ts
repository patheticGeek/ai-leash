import { api } from "./tauriApi";

// Best-effort, fire-and-forget — a crash handler that can itself throw (or
// block on a rejected promise) defeats the point.
function report(kind: string, message: string, stack?: string) {
  api.reportFrontendCrash(kind, message, stack).catch(() => {});
}

// Catches what a React error boundary can't: errors thrown outside a render
// (event handlers, timers, non-React DOM code) and rejected promises no one
// ever attached a `.catch` to. Both get forwarded to the same backend crash
// log an uncaught Rust panic writes to (see `crashlog.rs`), so both halves
// of the app end up in one place to debug from after a restart.
export function installCrashReporting() {
  window.addEventListener("error", (event) => {
    report("error", event.message, event.error?.stack);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as unknown;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    report("unhandledrejection", message, stack);
  });
}

// Called from `ErrorBoundary`'s `componentDidCatch` — a render-time crash
// React itself caught, as opposed to the two cases above.
export function reportReactError(message: string, stack?: string) {
  report("react_error_boundary", message, stack);
}
