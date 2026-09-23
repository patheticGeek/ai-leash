import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useConversations } from "../data/conversations";
import { qk } from "../data/keys";
import { useAppStore } from "../store";
import { api } from "./tauriApi";
import { useTauriEvent } from "./useTauriEvent";

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
      queryClient.invalidateQueries({ queryKey: qk.gitBranch(path) });
    }
  });

  const query = useQuery({
    queryKey: qk.gitBranch(path),
    queryFn: () => api.getCurrentGitBranch(path),
  });

  return query.data ?? null;
}

// Starts the backend `HEAD` watcher for every checkout the app knows about —
// each recent project, and each conversation's project root and worktree —
// not just the ones with a branch label currently mounted. Otherwise a
// project only starts being watched once its row/`CheckoutBar` renders, and
// any switch made before then is missed until the next 30s-stale refetch.
// `watchGitBranch` is a no-op for a path already watched, so re-running this
// as the set grows is cheap. Mount once, near the app root.
export function useGitBranchWatchers() {
  const recentProjects = useAppStore((s) => s.recentProjects);
  const conversations = useConversations();

  const paths = useMemo(() => {
    const all = new Set<string>(recentProjects.map((p) => p.path));
    for (const c of conversations) {
      all.add(c.projectRoot);
      if (c.worktreePath) all.add(c.worktreePath);
    }
    return [...all];
  }, [recentProjects, conversations]);

  useEffect(() => {
    for (const path of paths) {
      // Not a git repo (yet), or gone: nothing to watch.
      api.watchGitBranch(path).catch(() => {});
    }
  }, [paths]);
}
