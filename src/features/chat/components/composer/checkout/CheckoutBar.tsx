import { useCallback, useEffect, useState } from "react";
import { api, type GitWorktree } from "@/lib/tauriApi";
import { useCurrentGitBranch } from "@/lib/useCurrentGitBranch";
import DockedBanner from "../../banners/DockedBanner";
import BranchPicker from "./BranchPicker";
import WorktreePicker, { worktreeLabel } from "./WorktreePicker";

export interface CheckoutBarProps {
  sessionId: string;
  projectRoot: string;
  // The conversation's currently-active checkout — the primary root, or a
  // worktree path.
  cwd: string;
  // Only a conversation that hasn't sent its first message yet can change
  // its worktree — once a real ACP/tool session is running against a cwd,
  // that cwd is fixed for the conversation's lifetime. The branch picker has
  // no such restriction: what's checked out inside a given worktree can
  // change at any time without moving the conversation to a different
  // directory. Mirrors `ChatPanel.tsx`'s `isNewThread`.
  editable: boolean;
  // `null` means the primary checkout.
  onWorktreeSelected: (worktreePath: string | null) => void;
}

// Sits directly below `ChatInputBar` as a bottom-docked `DockedBanner`
// (mirroring `ClaudeRateLimitBanner` above it). Its default variant is
// `bg-card`, the app's established "recessed surface" tone (see `Input`'s
// default variant), so this reads as consistent rather than a one-off color.
// A `group`, not the `Alert`'s default `alert` role — it holds controls, not
// a message to announce.
//
// Two independent pickers share the bar: which worktree (left) and which
// branch is checked out there (right, pinned to the far edge). They're
// separate because a worktree's checked-out branch can be changed on its
// own (`git checkout` inside it) without moving the conversation to a
// different directory — and because what's checked out can also drift from
// outside the app entirely, which is why the branch side is never read from
// storage, only watched live (see `git.rs`'s module doc).
export default function CheckoutBar({
  sessionId,
  projectRoot,
  cwd,
  editable,
  onWorktreeSelected,
}: CheckoutBarProps) {
  const [worktrees, setWorktrees] = useState<GitWorktree[]>([]);
  // Live — updates on its own once `checkoutGitBranch` below actually moves
  // `HEAD`, via the same watcher this hook starts (see its doc comment), so
  // `selectBranch`/`createBranch` don't need to set it themselves.
  const branch = useCurrentGitBranch(cwd);

  const refreshWorktrees = useCallback(() => {
    api
      .listGitWorktrees(projectRoot)
      .then(setWorktrees)
      .catch(() => setWorktrees([]));
  }, [projectRoot]);

  useEffect(refreshWorktrees, [refreshWorktrees]);

  async function selectWorktree(path: string, isPrimary: boolean) {
    const worktreePath = isPrimary ? projectRoot : path;
    await api.setConversationRoot(sessionId, projectRoot, worktreePath);
    onWorktreeSelected(isPrimary ? null : worktreePath);
  }

  async function createWorktree(branchName: string, baseBranch: string | null) {
    const worktreePath = await api.createGitWorktree(
      projectRoot,
      branchName,
      baseBranch,
    );
    await api.setConversationRoot(sessionId, projectRoot, worktreePath);
    setWorktrees((prev) => [
      ...prev,
      { path: worktreePath, branch: branchName, isPrimary: false },
    ]);
    onWorktreeSelected(worktreePath);
  }

  async function deleteWorktree(path: string, force: boolean) {
    await api.deleteGitWorktree(projectRoot, path, force);
    setWorktrees((prev) => prev.filter((w) => w.path !== path));
  }

  async function selectBranch(name: string) {
    await api.checkoutGitBranch(cwd, name, null);
  }

  async function createBranch(name: string, base: string) {
    await api.checkoutGitBranch(cwd, name, base);
    // This worktree's own label/branch in the left list may now be stale —
    // cheap enough to just refetch rather than patch it in place.
    refreshWorktrees();
  }

  const active = worktrees.find(
    (w) => (w.isPrimary ? projectRoot : w.path) === cwd,
  );

  return (
    <DockedBanner side="bottom" role="group" aria-label="Checkout">
      <WorktreePicker
        worktrees={worktrees}
        activePath={cwd}
        projectRoot={projectRoot}
        label={active ? worktreeLabel(active) : "primary"}
        editable={editable}
        onRefresh={refreshWorktrees}
        onSelect={selectWorktree}
        onCreate={createWorktree}
        onDelete={deleteWorktree}
      />
      <BranchPicker
        cwd={cwd}
        branch={branch}
        onSelect={selectBranch}
        onCreate={createBranch}
        onDelete={(name, force) => api.deleteGitBranch(cwd, name, force)}
      />
    </DockedBanner>
  );
}
