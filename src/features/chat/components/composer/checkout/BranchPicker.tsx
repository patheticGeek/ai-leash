import { GitBranch as GitBranchIcon } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { useAsyncAction } from "../../../hooks/useAsyncAction";
import { useGitBranches } from "../../../hooks/useGitBranches";
import { CreatePanel, NewBranchFields } from "./CreatePanel";
import DeletableRow from "./DeletableRow";
import PickerList from "./PickerList";

// Which branch is checked out in the conversation's directory: switch to
// one, create-and-switch to a new one, or delete one.
export default function BranchPicker({
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
  const [newBranch, setNewBranch] = useState("");
  const { branches, baseBranch, setBaseBranch, removeBranch } = useGitBranches(
    cwd,
    open,
  );
  const action = useAsyncAction();

  function closePopover(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreating(false);
      action.clearError();
    }
  }

  async function pick(name: string) {
    if (await action.run(() => onSelect(name))) closePopover(false);
  }

  async function deleteBranch(name: string, force: boolean) {
    await onDelete(name, force);
    removeBranch(name);
  }

  async function submitNew() {
    if (!newBranch.trim() || !baseBranch) return;
    const ok = await action.run(() => onCreate(newBranch.trim(), baseBranch));
    if (ok) {
      closePopover(false);
      setNewBranch("");
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
          <PickerList
            searchPlaceholder="Search branches..."
            createLabel="New branch…"
            createValue="new-branch"
            onCreate={() => setCreating(true)}
          >
            {branches.map((b) => (
              <DeletableRow
                key={b.name}
                value={b.name}
                label={b.name}
                active={b.name === branch}
                deletable={!b.isCurrent}
                selectDisabled={action.pending}
                onSelect={() => pick(b.name)}
                onDelete={(force) => deleteBranch(b.name, force)}
              />
            ))}
            {action.error && (
              <span className="block px-2 py-1 text-xs text-red-400">
                {action.error}
              </span>
            )}
          </PickerList>
        ) : (
          <CreatePanel
            error={action.error}
            canSubmit={!!newBranch.trim() && !!baseBranch}
            submitting={action.pending}
            onBack={() => setCreating(false)}
            onSubmit={submitNew}
          >
            <NewBranchFields
              name={newBranch}
              onNameChange={setNewBranch}
              baseBranch={baseBranch}
              onBaseBranchChange={setBaseBranch}
              branches={branches}
            />
          </CreatePanel>
        )}
      </PopoverContent>
    </Popover>
  );
}
