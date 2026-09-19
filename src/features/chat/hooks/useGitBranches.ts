import { useEffect, useState } from "react";
import { api, type GitBranch } from "@/lib/tauriApi";

// The branches of the repo at `root`, re-listed whenever `open` turns true
// (they can change outside the app, so a stale list from the last open would
// be wrong). `baseBranch` is the pick for "branch new work off of what?" —
// it defaults to the checked-out branch (else the first) once the list
// arrives and keeps whatever the user chose after that.
export function useGitBranches(root: string, open: boolean) {
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [baseBranch, setBaseBranch] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .listGitBranches(root)
      .then((list) => {
        setBranches(list);
        setBaseBranch(
          (prev) =>
            prev ??
            list.find((b) => b.isCurrent)?.name ??
            list[0]?.name ??
            null,
        );
      })
      .catch(() => setBranches([]));
  }, [open, root]);

  return {
    branches,
    baseBranch,
    setBaseBranch,
    /** Drop a just-deleted branch from the list without refetching. */
    removeBranch: (name: string) =>
      setBranches((prev) => prev.filter((b) => b.name !== name)),
  };
}
