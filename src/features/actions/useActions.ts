import { useEffect, useState } from "react";
import { type ActionSummary, api } from "../../lib/tauriApi";
import { useAppStore } from "../../store";

// Polls rather than reacting to events — Actions don't have a push channel
// the way sub-agents do (see `chat://.../subtask_start`), and a 2s interval
// is more than responsive enough for "is this still running" status.
// Shared by `ActionsTab` (the full list) and `TitleBarActions` (the
// title-bar shortcut button), so both stay in sync with the same poll.
//
// Scoped to whichever conversation is currently focused (`activeSessionId`)
// — Actions and their run status live per-checkout on the backend (see
// `actions.rs`'s `run_key`), so switching to a conversation pinned to a
// different worktree must show *that* worktree's actions, not whatever the
// previously-focused one had. Restarts the poll whenever it changes.
export function useActions() {
  const sessionId = useAppStore((s) => s.activeSessionId);
  const [actions, setActions] = useState<ActionSummary[]>([]);

  async function refresh() {
    if (!sessionId) {
      setActions([]);
      return;
    }
    setActions(await api.listActions(sessionId));
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is a fresh function reference every render (not memoized) and would restart the interval every render if added as a dep
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [sessionId]);

  return { actions, refresh, sessionId };
}
