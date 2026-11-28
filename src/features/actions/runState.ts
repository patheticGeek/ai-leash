import type { ActionSummary } from "../../lib/tauriApi";

// How an action's current or last run stands, shared by every surface that
// shows it (the Actions tab's rows, the top bar's split button and its
// dropdown) so they agree on colour and wording. Running is the attention
// state (warning, pulsing dot); a run that exited on its own with a non-zero
// code is the one failure worth flagging (error).
export type RunTone = "warning" | "error" | "neutral";

export function runState(action: ActionSummary): {
  tone: RunTone;
  label: string;
  failed: boolean;
} {
  const failed =
    action.status === "exited" &&
    action.exitCode !== null &&
    action.exitCode !== 0;
  if (action.running) return { tone: "warning", label: "Running", failed };
  if (failed) {
    return { tone: "error", label: `Exited ${action.exitCode}`, failed };
  }
  if (action.status === "exited") {
    return { tone: "neutral", label: "Exited", failed };
  }
  if (action.status === "stopped") {
    return { tone: "neutral", label: "Stopped", failed };
  }
  return { tone: "neutral", label: "Not started", failed };
}
