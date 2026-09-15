import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/tauriApi";
import { useTauriEvent } from "../../../lib/useTauriEvent";

// The root listing's key slot is `checkoutPath` itself rather than a
// sentinel like `null` — it really is "the listing of this directory", and
// keeping every key's path slot a real absolute path (matching what the
// backend's `fs://changed` payload carries, see `useFsChangeInvalidator`)
// is what lets invalidation match on it directly instead of needing to
// separately track which checkout owns which query.
export function fsDirQueryKey(checkoutPath: string, path?: string) {
  return ["fs-dir", checkoutPath, path ?? checkoutPath] as const;
}

// Lists `path` (or the checkout root when omitted) within `checkoutPath`.
// Scoped to the checkout itself (see `commands.rs`'s `list_dir` doc
// comment), not a session id, so conversations sharing a checkout share one
// cache entry. Kept fresh by `useFsChangeInvalidator`, mounted once at the
// app's top level rather than here — see its comment for why.
export function useFsDir(
  checkoutPath: string | null,
  path?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: fsDirQueryKey(checkoutPath ?? "", path),
    queryFn: () => api.listDir(checkoutPath as string, path),
    enabled: enabled && checkoutPath != null,
  });
}

// One shared `fs://changed` listener for the whole app, mounted once at the
// top level (`App.tsx`) rather than inside `FileTree` — `FileTree` (and any
// expanded `Node` beneath it) only exists while its sidebar tab is mounted,
// so a listener scoped to it would miss changes made while the tab is
// closed, leaving stale cached listings behind for up to `staleTime` once
// reopened. `useTauriEvent` itself already dedupes to one real `listen()`
// regardless of how many components call it, so this being "always on"
// costs nothing extra.
//
// The backend batches each burst of filesystem changes into the set of
// directories whose *listings* actually changed (see `start_fs_watcher`) and
// sends that as the payload — real absolute paths, matching the third slot
// of `fsDirQueryKey` exactly (root listings key on `checkoutPath` itself for
// this reason). So a change under one project's checkout only invalidates
// that project's own cached directories, never another open project's.
export function useFsChangeInvalidator() {
  const queryClient = useQueryClient();

  useTauriEvent<string[]>("fs://changed", (changedDirs) => {
    const changed = new Set(changedDirs);
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "fs-dir" &&
        changed.has(query.queryKey[2] as string),
    });
  });
}
