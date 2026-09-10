import { useEffect, useState } from "react";
import { type ActionSummary, api } from "../../lib/tauriApi";

// Polls rather than reacting to events — Actions don't have a push channel
// the way sub-agents do (see `chat://.../subtask_start`), and a 2s interval
// is more than responsive enough for "is this still running" status.
// Shared by `ActionsTab` (the full list) and `TitleBarActions` (the
// title-bar shortcut button), so both stay in sync with the same poll.
export function useActions() {
  const [actions, setActions] = useState<ActionSummary[]>([]);

  async function refresh() {
    setActions(await api.listActions());
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once poll setup — refresh is a fresh function reference every render (not memoized) and would restart the interval every render if added as a dep
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  return { actions, refresh };
}
