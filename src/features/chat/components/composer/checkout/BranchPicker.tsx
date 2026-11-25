import { Banner } from "@astryxdesign/core/Banner";
import { Popover } from "@astryxdesign/core/Popover";
import { GitBranch } from "lucide-react";
import { useState } from "react";
import { useAsyncAction } from "../../../hooks/useAsyncAction";
import { useGitBranches } from "../../../hooks/useGitBranches";
import { CreatePanel, NewBranchFields } from "./CreatePanel";
import DeletableRow from "./DeletableRow";
import PickerList from "./PickerList";
import PickerTrigger from "./PickerTrigger";

export const PICKER_WIDTH = 340;

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

  function showList() {
    setCreating(false);
    action.clearError();
  }

  async function pick(name: string) {
    if (await action.run(() => onSelect(name))) closePopover(false);
  }

  async function deleteBranch(name: string, force: boolean) {
    await onDelete(name, force);
    removeBranch(name);
  }

  const canSubmit = !!newBranch.trim() && !!baseBranch && !action.pending;
  async function submitNew() {
    if (!canSubmit || !baseBranch) return;
    const ok = await action.run(() => onCreate(newBranch.trim(), baseBranch));
    if (ok) {
      closePopover(false);
      setNewBranch("");
    }
  }

  return (
    <Popover
      isOpen={open}
      onOpenChange={closePopover}
      label="Branches"
      placement="above"
      alignment="end"
      width={PICKER_WIDTH}
      // Only while open, so the search and any half-done delete start
      // fresh each time.
      content={
        !open ? null : !creating ? (
          <PickerList
            searchPlaceholder="Search branches..."
            createLabel="New branch…"
            onCreate={() => {
              action.clearError();
              setCreating(true);
            }}
            rows={branches.map((b) => ({
              key: b.name,
              searchText: b.name,
              isCurrent: b.name === branch,
              isDisabled: action.pending,
              onSelect: () => void pick(b.name),
              render: (row) => (
                <DeletableRow
                  {...row}
                  label={b.name}
                  active={b.name === branch}
                  deletable={!b.isCurrent}
                  selectDisabled={action.pending}
                  onSelect={() => void pick(b.name)}
                  onDelete={(force) => deleteBranch(b.name, force)}
                />
              ),
            }))}
            footer={
              action.error && (
                <Banner
                  status="error"
                  collapsible={false}
                  title="Couldn't switch branch"
                  description={action.error}
                />
              )
            }
          />
        ) : (
          <CreatePanel
            title="New branch"
            canSubmit={canSubmit}
            submitting={action.pending}
            onBack={showList}
            onSubmit={submitNew}
          >
            <NewBranchFields
              name={newBranch}
              onNameChange={(name) => {
                setNewBranch(name);
                action.clearError();
              }}
              onEnter={() => void submitNew()}
              baseBranch={baseBranch}
              onBaseBranchChange={setBaseBranch}
              branches={branches}
              error={action.error}
            />
          </CreatePanel>
        )
      }
    >
      <PickerTrigger
        icon={GitBranch}
        label="Branch"
        name={branch ?? "detached"}
      />
    </Popover>
  );
}
