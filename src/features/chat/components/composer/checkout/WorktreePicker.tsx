import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Folder as FolderIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { GitWorktree } from "@/lib/tauriApi";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { useAsyncAction } from "../../../hooks/useAsyncAction";
import { useGitBranches } from "../../../hooks/useGitBranches";
import { CreatePanel, NewBranchFields } from "./CreatePanel";
import DeletableRow from "./DeletableRow";
import PickerList from "./PickerList";

export function worktreeLabel(w: GitWorktree): string {
  if (w.isPrimary) return "primary";
  return w.path.split(/[\\/]/).filter(Boolean).pop() ?? w.path;
}

// Which worktree the conversation runs in: pick one, or (while `editable`)
// create a new one on a new or existing branch, or delete one.
export default function WorktreePicker({
  worktrees,
  activePath,
  projectRoot,
  label,
  editable,
  onRefresh,
  onSelect,
  onCreate,
  onDelete,
}: {
  worktrees: GitWorktree[];
  activePath: string;
  projectRoot: string;
  label: string;
  // When false the list is still browsable, but nothing can be switched,
  // created or deleted.
  editable: boolean;
  onRefresh: () => void;
  onSelect: (path: string, isPrimary: boolean) => void;
  onCreate: (branch: string, baseBranch: string | null) => Promise<void>;
  onDelete: (path: string, force: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [branchName, setBranchName] = useState("");
  const { branches, baseBranch, setBaseBranch } = useGitBranches(
    projectRoot,
    open,
  );
  const create = useAsyncAction();

  // Worktrees can be added/removed outside the app, so re-list on every open.
  useEffect(() => {
    if (open) onRefresh();
  }, [open, onRefresh]);

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
      create.clearError();
      setBranchName("");
    }
  }

  const canCreate =
    mode === "new" ? !!branchName.trim() && !!baseBranch : !!branchName;

  async function submit() {
    if (!canCreate) return;
    const ok = await create.run(() =>
      onCreate(branchName.trim(), mode === "new" ? baseBranch : null),
    );
    if (ok) closePopover(false);
  }

  return (
    <Popover open={open} onOpenChange={closePopover}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={
            editable
              ? undefined
              : "The worktree is fixed once the conversation has started"
          }
          className={cn(
            "inline-flex max-w-40 cursor-pointer items-center gap-1.5 truncate text-left hover:text-zinc-200",
            !editable && "text-zinc-500",
          )}
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
          <PickerList
            searchPlaceholder="Search worktrees..."
            createLabel={editable ? "New worktree…" : undefined}
            createValue="new-worktree"
            onCreate={() => setCreating(true)}
          >
            {worktrees.map((w) => {
              const path = w.isPrimary ? projectRoot : w.path;
              return (
                <DeletableRow
                  key={w.path}
                  value={`${worktreeLabel(w)} ${w.branch ?? ""}`}
                  label={worktreeLabel(w)}
                  active={path === activePath}
                  deletable={editable && !w.isPrimary && path !== activePath}
                  selectDisabled={!editable && path !== activePath}
                  onSelect={() => {
                    if (editable) onSelect(path, w.isPrimary);
                    closePopover(false);
                  }}
                  onDelete={(force) => onDelete(w.path, force)}
                />
              );
            })}
          </PickerList>
        ) : (
          <CreatePanel
            error={create.error}
            canSubmit={canCreate}
            submitting={create.pending}
            onBack={() => setCreating(false)}
            onSubmit={submit}
          >
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={mode === "new" ? "primary" : "secondary"}
                label="New branch"
                onClick={() => setMode("new")}
              />
              <Button
                size="sm"
                variant={mode === "existing" ? "primary" : "secondary"}
                label="Existing branch"
                onClick={() => setMode("existing")}
              />
            </div>
            {mode === "new" ? (
              <NewBranchFields
                name={branchName}
                onNameChange={setBranchName}
                baseBranch={baseBranch}
                onBaseBranchChange={setBaseBranch}
                branches={branches}
              />
            ) : (
              <>
                <Selector
                  label="Branch"
                  size="sm"
                  width="100%"
                  value={branchName || undefined}
                  onChange={setBranchName}
                  placeholder="Select a branch"
                  emptyText="No unattached branches"
                  options={availableBranches.map((b) => b.name)}
                />
                {availableBranches.length === 0 && (
                  <span className="text-zinc-600">No unattached branches</span>
                )}
              </>
            )}
          </CreatePanel>
        )}
      </PopoverContent>
    </Popover>
  );
}
