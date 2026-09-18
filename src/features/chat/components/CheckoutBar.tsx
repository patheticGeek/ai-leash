import {
  Check,
  Folder as FolderIcon,
  GitBranch as GitBranchIcon,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/ui/command";
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
import { useCurrentGitBranch } from "../../../lib/useCurrentGitBranch";

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
  if (w.isPrimary) return "primary";
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
  // Live — updates on its own once `checkoutGitBranch` below actually moves
  // `HEAD`, via the same watcher this hook starts (see its doc comment), so
  // `selectBranch`/`createBranch` don't need to set it themselves.
  const branch = useCurrentGitBranch(cwd);

  useEffect(() => {
    api
      .listGitWorktrees(projectRoot)
      .then(setWorktrees)
      .catch(() => setWorktrees([]));
  }, [projectRoot]);

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
        label={active ? worktreeLabel(active) : "primary"}
        editable={editable}
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
    </div>
  );
}

// A `cmdk` item — arrow-key/typeahead navigable via `Command`'s own keyboard
// handling — that's a plain select row until its trash icon is clicked, then
// swaps in place for a "delete this?" confirm strip, and again for an error
// (with a force-delete retry) if the plain delete git refuses — e.g. a dirty
// worktree or an unmerged branch. The confirm/error strips render as plain
// (non-`CommandItem`) rows: `cmdk` still filters/positions them by DOM order,
// but they fall out of keyboard nav and stay clickable without fighting
// `CommandItem`'s own `disabled` styling (which sets `pointer-events-none`
// on the whole row, including the strip's own buttons). Kept as a strip
// *within* the row rather than a native `confirm()` dialog so the popover
// never grows a second, heavier layer of modal-ness.
function DeletableRow({
  value,
  label,
  active,
  deletable,
  selectDisabled,
  onSelect,
  onDelete,
}: {
  // What `cmdk` matches the search query against — not necessarily `label`
  // (see `WorktreePicker`, which also searches the checked-out branch name).
  value: string;
  label: string;
  active: boolean;
  deletable: boolean;
  selectDisabled?: boolean;
  onSelect: () => void;
  onDelete: (force: boolean) => Promise<void>;
}) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "deleting" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function runDelete(force: boolean) {
    setPhase("deleting");
    try {
      await onDelete(force);
      // Success removes this row from the parent's list; nothing left to do.
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  if (phase === "confirm" || phase === "deleting") {
    return (
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <span className="truncate text-xs text-zinc-500">Delete {label}?</span>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={phase === "deleting"}
            onClick={() => setPhase("idle")}
          >
            <X size={12} />
          </Button>
          <Button
            size="icon-sm"
            variant="danger"
            disabled={phase === "deleting"}
            onClick={() => runDelete(false)}
          >
            <Check size={12} />
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex flex-col gap-1 px-2 py-1.5">
        <span className="text-xs text-red-400">{error}</span>
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setPhase("idle")}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={() => runDelete(true)}>
            Force delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CommandItem
      value={value}
      disabled={selectDisabled}
      onSelect={onSelect}
      className="cursor-pointer justify-between gap-2 flex"
    >
      <span
        className={`min-w-0 flex-1 truncate ${active ? "text-zinc-100" : "text-zinc-300"}`}
      >
        {label}
      </span>
      {deletable && (
        <Button
          variant="danger"
          size="icon-sm"
          className="shrink-0 opacity-0 group-hover/command-item:opacity-100 group-data-selected/command-item:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setPhase("confirm");
          }}
        >
          <Trash2 size={12} />
        </Button>
      )}
    </CommandItem>
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
  onDelete,
}: {
  worktrees: GitWorktree[];
  activePath: string;
  projectRoot: string;
  label: string;
  editable: boolean;
  onSelect: (path: string, isPrimary: boolean) => void;
  onCreate: (branch: string, baseBranch: string | null) => Promise<void>;
  onDelete: (path: string, force: boolean) => Promise<void>;
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
        className="flex w-72 flex-col gap-0 overflow-hidden p-0"
      >
        {!creating ? (
          <Command className="gap-0 rounded-none! bg-transparent p-0">
            <CommandInput placeholder="Search worktrees..." autoFocus />
            <CommandList className="max-h-80 px-1 pt-1">
              <CommandEmpty className="px-2 py-3 text-sm text-zinc-600">
                No matches.
              </CommandEmpty>
              {worktrees.map((w) => {
                const path = w.isPrimary ? projectRoot : w.path;
                return (
                  <DeletableRow
                    key={w.path}
                    value={`${worktreeLabel(w)} ${w.branch ?? ""}`}
                    label={worktreeLabel(w)}
                    active={path === activePath}
                    deletable={!w.isPrimary && path !== activePath}
                    onSelect={() => {
                      onSelect(path, w.isPrimary);
                      closePopover(false);
                    }}
                    onDelete={(force) => onDelete(w.path, force)}
                  />
                );
              })}
              <CommandItem
                value="new-worktree"
                forceMount
                onSelect={() => setCreating(true)}
                className="sticky bottom-0 border-t border-white/5 bg-popover text-zinc-200 cursor-pointer"
              >
                New worktree…
              </CommandItem>
            </CommandList>
          </Command>
        ) : (
          <>
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto p-3">
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
                    <span className="text-zinc-600">
                      No unattached branches
                    </span>
                  )}
                </>
              )}
              {error && <span className="text-red-400">{error}</span>}
            </div>
            <div className="flex justify-end gap-2 border-t border-white/5 p-2">
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
          </>
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
  onDelete,
}: {
  cwd: string;
  branch: string | null;
  onSelect: (name: string) => Promise<void>;
  onCreate: (name: string, base: string) => Promise<void>;
  onDelete: (name: string, force: boolean) => Promise<void>;
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

  async function deleteBranch(name: string, force: boolean) {
    await onDelete(name, force);
    setBranches((prev) => prev.filter((b) => b.name !== name));
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
          className="inline-flex max-w-60 cursor-pointer items-center gap-1.5 truncate text-left hover:text-zinc-200"
        >
          <GitBranchIcon size={12} className="shrink-0" />
          <span className="truncate">{branch ?? "detached"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="flex w-64 flex-col gap-0 overflow-hidden p-0"
      >
        {!creating ? (
          <Command className="gap-0 rounded-none! bg-transparent p-0">
            <CommandInput placeholder="Search branches..." autoFocus />
            <CommandList className="max-h-80 px-1 pt-1">
              <CommandEmpty className="px-2 py-3 text-sm text-zinc-600">
                No matches.
              </CommandEmpty>
              {branches.map((b) => (
                <DeletableRow
                  key={b.name}
                  value={b.name}
                  label={b.name}
                  active={b.name === branch}
                  deletable={!b.isCurrent}
                  selectDisabled={submitting}
                  onSelect={() => pick(b.name)}
                  onDelete={(force) => deleteBranch(b.name, force)}
                />
              ))}
              {error && (
                <span className="block px-2 py-1 text-xs text-red-400">
                  {error}
                </span>
              )}
              <CommandItem
                value="new-branch"
                forceMount
                onSelect={() => setCreating(true)}
                className="cursor-pointer sticky bottom-0 border-t border-white/5 bg-popover text-zinc-200"
              >
                New branch…
              </CommandItem>
            </CommandList>
          </Command>
        ) : (
          <>
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto p-3">
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
            </div>
            <div className="flex justify-end gap-2 border-t border-white/5 p-2">
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
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
