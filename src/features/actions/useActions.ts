import { useQuery } from "@tanstack/react-query";
import { qk } from "../../data/keys";
import { queryClient } from "../../lib/queryClient";
import { type ActionSummary, api } from "../../lib/tauriApi";
import { useActiveCheckoutPath } from "../../lib/useActiveCheckoutPath";
import { useTauriEvent } from "../../lib/useTauriEvent";

// Keyed on the resolved checkout path, not the session/conversation id: the
// backend keys Actions and their run status by checkout path too (see
// `actions.rs`'s `run_key`), and multiple conversations routinely share one
// (every brand-new conversation defaults to the primary root), so they share
// one cache entry for what the backend considers identical state.
//
// No polling: `useActionEvents` (mounted once in `App.tsx`) keeps this live
// off the backend's `run://status` and `action://defs-changed` events, so
// every caller — the Actions tab, the title bar's split button,
// `ActionTerminalTab` — sees a run start, stop or exit the moment it happens.
export function useActions() {
  const checkoutPath = useActiveCheckoutPath();
  const query = useQuery({
    queryKey: qk.actions(checkoutPath),
    queryFn: () => api.listActions(checkoutPath as string),
    enabled: checkoutPath != null,
  });

  return {
    actions: checkoutPath ? (query.data ?? []) : [],
    checkoutPath,
  };
}

interface RunStatusPayload {
  checkoutPath: string;
  actionId: string;
  runId: string;
  ptyId: string;
  status: "running" | "exited" | "stopped";
  exitCode: number | null;
  startedAt: number;
  endedAt: number | null;
}

// One always-mounted pair of listeners for every checkout. `run://status`
// carries the run's new state, so it patches the cached list in place (a
// run starting also makes that action the checkout's "last run"); a cache
// entry that doesn't have the action yet, or no entry for that checkout at
// all, falls back to refetching every Actions list. `action://defs-changed`
// only names the checkout, so it refetches that one.
export function useActionEvents() {
  useTauriEvent<RunStatusPayload>("run://status", (e) => {
    const key = qk.actions(e.checkoutPath);
    let patched = false;
    queryClient.setQueryData<ActionSummary[]>(key, (old) => {
      if (!old?.some((a) => a.id === e.actionId)) return old;
      patched = true;
      return old.map((a) =>
        a.id === e.actionId
          ? {
              ...a,
              running: e.status === "running",
              status: e.status,
              runId: e.runId,
              ptyId: e.ptyId,
              exitCode: e.exitCode,
              startedAt: e.startedAt,
              endedAt: e.endedAt,
              lastRun: e.status === "running" ? true : a.lastRun,
            }
          : e.status === "running"
            ? { ...a, lastRun: false }
            : a,
      );
    });
    if (!patched) {
      void queryClient.invalidateQueries({ queryKey: ["actions"] });
    }
  });
  useTauriEvent<{ checkoutPath: string }>("action://defs-changed", (e) => {
    void queryClient.invalidateQueries({
      queryKey: qk.actions(e.checkoutPath),
    });
  });
}
