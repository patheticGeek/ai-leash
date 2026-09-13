import { listen } from "@tauri-apps/api/event";
import { Folder as FolderIcon, GitBranch as GitBranchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { api, type GitBranch, type GitWorktree } from "../../../lib/tauriApi";

interface CheckoutBarProps {
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

function worktreeLabel(w: GitWorktree): string {
  if (w.isPrimary) return "Primary checkout";
  return w.path.split(/[\\/]/).filter(Boolean).pop() ?? w.path;
}

// Sits directly below `ChatInputBar`, mirroring `ClaudeRateLimitBanner`'s
// placement above it — same `-m*-4`-into-the-input-padding trick, just
// pointed the other direction. Background sits between the input's
// `bg-[#17181c]` and the panel's `bg-[#111215]`; `#141518` is also already
// the app's established "recessed surface" tone (see `Input`'s default
// variant), so this reads as consistent rather than a one-off color.
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
  const [branch, setBranch] = useState<string | null>(null);

  useEffect(() => {
    api
      .listGitWorktrees(projectRoot)
      .then(setWorktrees)
      .catch(() => setWorktrees([]));
  }, [projectRoot]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      api
        .getCurrentGitBranch(cwd)
        .then((b) => {
          if (!cancelled) setBranch(b);
        })
        .catch(() => {});
    };
    api.watchGitBranch(cwd).catch(() => {});
    refresh();
    const unlisten = listen<string>("git://branch_changed", (e) => {
      if (e.payload === cwd) refresh();
    });
    return () => {
      cancelled = true;
      unlisten.then((f) => f());
    };
  }, [cwd]);

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

  async function selectBranch(name: string) {
    await api.checkoutGitBranch(cwd, name, null);
    setBranch(name);
  }

  async function createBranch(name: string, base: string) {
    await api.checkoutGitBranch(cwd, name, base);
    setBranch(name);
    // This worktree's own label/branch in the left list may now be stale —
    // cheap enough to just refetch rather than patch it in place.
    api
      .listGitWorktrees(projectRoot)
      .then(setWorktrees)
      .catch(() => {});
  }

  const active = worktrees.find(
    (w) => (w.isPrimary ? projectRoot : w.path) === cwd,
  );

  return (
    <div className="z-10 mx-7 -mt-3.5 mb-3 flex items-center justify-between rounded-b-md bg-[#141518] px-3 py-2 text-xs text-zinc-400">
      <WorktreePicker
        worktrees={worktrees}
        activePath={cwd}
        projectRoot={projectRoot}
        label={active ? worktreeLabel(active) : "Primary checkout"}
        editable={editable}
        onSelect={selectWorktree}
        onCreate={createWorktree}
      />
      <BranchPicker
        cwd={cwd}
        branch={branch}
        onSelect={selectBranch}
        onCreate={createBranch}
      />
    </div>
  );
}

function WorktreePicker({
  worktrees,
  activePath,
  projectRoot,
  label,
  editable,
  onSelect,
  onCreate,
}: {
  worktrees: GitWorktree[];
  activePath: string;
  projectRoot: string;
  label: string;
  editable: boolean;
  onSelect: (path: string, isPrimary: boolean) => void;
  onCreate: (branch: string, baseBranch: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [branchName, setBranchName] = useState("");
  const [baseBranch, setBaseBranch] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .listGitBranches(projectRoot)
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
  }, [open, projectRoot]);

  // A branch already checked out in another worktree can't be attached to
  // a new one too — git refuses ("already checked out").
  const usedBranches = new Set(
    worktrees.map((w) => w.branch).filter((b): b is string => !!b),
  );
  const availableBranches = branches.filter((b) => !usedBranches.has(b.name));

  function closePopover(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreating(false);
      setError(null);
      setBranchName("");
    }
  }

  async function submit() {
    if (mode === "new" ? !branchName.trim() || !baseBranch : !branchName) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(branchName.trim(), mode === "new" ? baseBranch : null);
      closePopover(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!editable) {
    return (
      <span
        className="inline-flex max-w-40 cursor-default items-center gap-1.5 truncate text-zinc-500"
        title={label}
      >
        <FolderIcon size={12} className="shrink-0" />
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={closePopover}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-40 cursor-pointer items-center gap-1.5 truncate text-left hover:text-zinc-200"
        >
          <FolderIcon size={12} className="shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-72 gap-0 overflow-hidden p-0"
      >
        {!creating ? (
          <div className="max-h-60 overflow-y-auto py-1">
            {worktrees.map((w) => {
              const path = w.isPrimary ? projectRoot : w.path;
              return (
                <Button
                  key={w.path}
                  variant="unstyled"
                  size="none"
                  onClick={() => {
                    onSelect(path, w.isPrimary);
                    closePopover(false);
                  }}
                  className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-white/5 ${
                    path === activePath ? "text-zinc-100" : "text-zinc-300"
                  }`}
                >
                  {worktreeLabel(w)}
                </Button>
              );
            })}
            <Button
              variant="unstyled"
              size="none"
              onClick={() => setCreating(true)}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5"
            >
              New worktree…
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={mode === "new" ? "default" : "outline"}
                onClick={() => setMode("new")}
              >
                New branch
              </Button>
              <Button
                size="sm"
                variant={mode === "existing" ? "default" : "outline"}
                onClick={() => setMode("existing")}
              >
                Existing branch
              </Button>
            </div>
            {mode === "new" ? (
              <>
                <span className="text-[11px] text-zinc-500">
                  New branch name
                </span>
                <Input
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="my-feature"
                  autoFocus
                />
                <span className="text-[11px] text-zinc-500">Base branch</span>
                <Select
                  value={baseBranch ?? undefined}
                  onValueChange={setBaseBranch}
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue placeholder="Select a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.name} value={b.name}>
                        {b.name}
                        {b.isCurrent ? " (current)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <span className="text-[11px] text-zinc-500">Branch</span>
                <Select
                  value={branchName || undefined}
                  onValueChange={setBranchName}
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue placeholder="Select a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBranches.map((b) => (
                      <SelectItem key={b.name} value={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableBranches.length === 0 && (
                  <span className="text-zinc-600">No unattached branches</span>
                )}
              </>
            )}
            {error && <span className="text-red-400">{error}</span>}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreating(false)}
              >
                Back
              </Button>
              <Button
                size="sm"
                disabled={
                  submitting ||
                  (mode === "new"
                    ? !branchName.trim() || !baseBranch
                    : !branchName)
                }
                onClick={submit}
              >
                {submitting ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function BranchPicker({
  cwd,
  branch,
  onSelect,
  onCreate,
}: {
  cwd: string;
  branch: string | null;
  onSelect: (name: string) => Promise<void>;
  onCreate: (name: string, base: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [newBranch, setNewBranch] = useState("");
  const [baseBranch, setBaseBranch] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .listGitBranches(cwd)
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
  }, [open, cwd]);

  function closePopover(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreating(false);
      setError(null);
    }
  }

  async function pick(name: string) {
    setSubmitting(true);
    setError(null);
    try {
      await onSelect(name);
      closePopover(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNew() {
    if (!newBranch.trim() || !baseBranch) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(newBranch.trim(), baseBranch);
      closePopover(false);
      setNewBranch("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={closePopover}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-40 cursor-pointer items-center gap-1.5 truncate text-left hover:text-zinc-200"
        >
          <GitBranchIcon size={12} className="shrink-0" />
          <span className="truncate">{branch ?? "detached"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="w-64 gap-0 overflow-hidden p-0"
      >
        {!creating ? (
          <div className="max-h-60 overflow-y-auto py-1">
            {branches.map((b) => (
              <Button
                key={b.name}
                variant="unstyled"
                size="none"
                disabled={submitting}
                onClick={() => pick(b.name)}
                className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-white/5 ${
                  b.name === branch ? "text-zinc-100" : "text-zinc-300"
                }`}
              >
                {b.name}
              </Button>
            ))}
            <Button
              variant="unstyled"
              size="none"
              onClick={() => setCreating(true)}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5"
            >
              New branch…
            </Button>
            {error && (
              <span className="block px-3 py-1 text-red-400">{error}</span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            <span className="text-[11px] text-zinc-500">New branch name</span>
            <Input
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              placeholder="my-feature"
              autoFocus
            />
            <span className="text-[11px] text-zinc-500">Base branch</span>
            <Select
              value={baseBranch ?? undefined}
              onValueChange={setBaseBranch}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Select a branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.name} value={b.name}>
                    {b.name}
                    {b.isCurrent ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <span className="text-red-400">{error}</span>}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreating(false)}
              >
                Back
              </Button>
              <Button
                size="sm"
                disabled={!newBranch.trim() || !baseBranch || submitting}
                onClick={submitNew}
              >
                {submitting ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
