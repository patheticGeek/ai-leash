import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./tauriApi";
import { useTauriEvent } from "./useTauriEvent";

export function gitBranchQueryKey(path: string) {
  return ["git-branch", path] as const;
}

// Live current branch for `path` — never trusted from a stored value (what's
// checked out at a path can change from outside the app: a manual
// `git checkout`, a rebase, another tool), so this fetches fresh on mount
// and again on every `git://branch_changed` event for this exact path. See
// `git.rs`'s module doc and `watch_git_branch` for the backend half. Backed
// by `useQuery` so every caller watching the same path (sidebar rows,
// `CheckoutBar`) shares one cache entry, and `useTauriEvent` so they share
// one real `listen()` registration.
export function useCurrentGitBranch(path: string): string | null {
  const queryClient = useQueryClient();

  useEffect(() => {
    api.watchGitBranch(path).catch(() => {});
  }, [path]);

  useTauriEvent<string>("git://branch_changed", (changedPath) => {
    if (changedPath === path) {
      queryClient.invalidateQueries({ queryKey: gitBranchQueryKey(path) });
    }
  });

  const query = useQuery({
    queryKey: gitBranchQueryKey(path),
    queryFn: () => api.getCurrentGitBranch(path),
  });

  return query.data ?? null;
}
