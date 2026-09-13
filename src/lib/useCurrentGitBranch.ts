import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { api } from "./tauriApi";

// Live current branch for `path` — never trusted from a stored value (what's
// checked out at a path can change from outside the app: a manual
// `git checkout`, a rebase, another tool), so this fetches fresh on mount
// and again on every `git://branch_changed` event for this exact path. See
// `git.rs`'s module doc and `watch_git_branch` for the backend half.
export function useCurrentGitBranch(path: string): string | null {
  const [branch, setBranch] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      api
        .getCurrentGitBranch(path)
        .then((b) => {
          if (!cancelled) setBranch(b);
        })
        .catch(() => {
          if (!cancelled) setBranch(null);
        });
    };
    api.watchGitBranch(path).catch(() => {});
    refresh();
    const unlisten = listen<string>("git://branch_changed", (e) => {
      if (e.payload === path) refresh();
    });
    return () => {
      cancelled = true;
      unlisten.then((f) => f());
    };
  }, [path]);

  return branch;
}
