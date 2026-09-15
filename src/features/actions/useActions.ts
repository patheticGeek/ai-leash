import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/tauriApi";
import { useActiveCheckoutPath } from "../../lib/useActiveCheckoutPath";

// Keyed on the resolved checkout path, not the session/conversation id: the
// backend keys Actions and their run status by checkout path too (see
// `actions.rs`'s `run_key`), and multiple conversations routinely share one
// (every brand-new conversation defaults to the primary root). Keying on
// session id would give each such conversation its own cache entry and its
// own poll for what the backend considers identical, already-shared state —
// e.g. starting a run from one conversation's Actions tab wouldn't be
// reflected by another conversation pinned to the same checkout until (and
// unless) *that* conversation's own independent poll happened to catch it.
export function actionsQueryKey(checkoutPath: string | null) {
  return ["actions", checkoutPath] as const;
}

// Polls rather than reacting to events — Actions don't have a push channel
// the way sub-agents do (see `chat://.../subtask_start`), and a 2s interval
// is more than responsive enough for "is this still running" status.
//
// Backed by React Query keyed on `actionsQueryKey`: every caller of this
// hook (or anyone else querying the same key directly, e.g.
// `ActionTerminalTab`) for the same checkout shares one cache entry and one
// 2s poll instead of each running its own independent
// `setInterval`/`listActions` call.
export function useActions() {
  const checkoutPath = useActiveCheckoutPath();
  const query = useQuery({
    queryKey: actionsQueryKey(checkoutPath),
    // Same value as the query key — the backend commands take the checkout
    // path directly now (see `actions.rs`), so there's no separate
    // session-id parameter to drift out of sync with the cache key.
    queryFn: () => api.listActions(checkoutPath as string),
    enabled: checkoutPath != null,
    refetchInterval: checkoutPath != null ? 2000 : false,
  });

  return {
    actions: checkoutPath ? (query.data ?? []) : [],
    refresh: query.refetch,
    checkoutPath,
  };
}
