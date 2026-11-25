import { Popover } from "@astryxdesign/core/Popover";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { FolderGit2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { GitWorktree } from "@/lib/tauriApi";
import { useAsyncAction } from "../../../hooks/useAsyncAction";
import { useGitBranches } from "../../../hooks/useGitBranches";
import { PICKER_WIDTH } from "./BranchPicker";
import { CreatePanel, NewBranchFields } from "./CreatePanel";
import DeletableRow from "./DeletableRow";
import PickerList from "./PickerList";
import PickerTrigger from "./PickerTrigger";

export function worktreeLabel(w: GitWorktree): string {
  if (w.isPrimary) return "primary";
  return w.path.split(/[\\/]/).filter(Boolean).pop() ?? w.path;
}

const LOCKED_TOOLTIP =
  "The worktree is fixed once the conversation has started";

// Which worktree the conversation runs in: pick one, create a new one on a
// new or existing branch, or delete one. Only while `editable` (a new
// thread); after that the trigger is disabled.
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

  if (!editable) {
    return (
      <PickerTrigger
        icon={FolderGit2}
        label="Worktree"
        name={label}
        isDisabled
        tooltip={LOCKED_TOOLTIP}
      />
    );
  }

  // A branch already checked out in another worktree can't be attached to
  // a new one too — git refuses ("already checked out").
  const usedBranches = new Set(
    worktrees.map((w) => w.branch).filter((b): b is string => !!b),
  );
  const availableBranches = branches.filter((b) => !usedBranches.has(b.name));

  function showList() {
    setCreating(false);
    create.clearError();
    setBranchName("");
  }

  function closePopover(next: boolean) {
    setOpen(next);
    if (!next) showList();
  }

  const canCreate =
    !create.pending &&
    (mode === "new" ? !!branchName.trim() && !!baseBranch : !!branchName);

  async function submit() {
    if (!canCreate) return;
    const ok = await create.run(() =>
      onCreate(branchName.trim(), mode === "new" ? baseBranch : null),
    );
    if (ok) closePopover(false);
  }

  return (
    <Popover
      isOpen={open}
      onOpenChange={closePopover}
      label="Worktrees"
      placement="above"
      alignment="start"
      width={PICKER_WIDTH}
      // Only while open, so the search and any half-done delete start
      // fresh each time.
      content={
        !open ? null : !creating ? (
          <PickerList
            searchPlaceholder="Search worktrees..."
            createLabel="New worktree…"
            onCreate={() => setCreating(true)}
            rows={worktrees.map((w) => {
              const path = w.isPrimary ? projectRoot : w.path;
              const select = () => {
                onSelect(path, w.isPrimary);
                closePopover(false);
              };
              return {
                key: w.path,
                searchText: `${worktreeLabel(w)} ${w.branch ?? ""}`,
                isCurrent: path === activePath,
                onSelect: select,
                render: (row) => (
                  <DeletableRow
                    {...row}
                    label={worktreeLabel(w)}
                    description={w.branch ?? undefined}
                    active={path === activePath}
                    deletable={!w.isPrimary && path !== activePath}
                    onSelect={select}
                    onDelete={(force) => onDelete(w.path, force)}
                  />
                ),
              };
            })}
          />
        ) : (
          <CreatePanel
            title="New worktree"
            canSubmit={canCreate}
            submitting={create.pending}
            onBack={showList}
            onSubmit={submit}
          >
            <SegmentedControl
              label="Branch"
              size="sm"
              layout="fill"
              value={mode}
              onChange={(v) => {
                setMode(v as "new" | "existing");
                setBranchName("");
                create.clearError();
              }}
            >
              <SegmentedControlItem label="New branch" value="new" />
              <SegmentedControlItem label="Existing branch" value="existing" />
            </SegmentedControl>
            {mode === "new" ? (
              <NewBranchFields
                name={branchName}
                onNameChange={(name) => {
                  setBranchName(name);
                  create.clearError();
                }}
                onEnter={() => void submit()}
                baseBranch={baseBranch}
                onBaseBranchChange={setBaseBranch}
                branches={branches}
                error={create.error}
              />
            ) : availableBranches.length === 0 ? (
              <VStack gap={1} paddingBlock={2}>
                <Text weight="semibold">No unattached branches</Text>
                <Text type="supporting" color="secondary">
                  Every branch already has a worktree. Make a new branch
                  instead.
                </Text>
              </VStack>
            ) : (
              <Selector
                label="Branch"
                size="sm"
                width="100%"
                value={branchName || undefined}
                onChange={(v) => {
                  setBranchName(v ?? "");
                  create.clearError();
                }}
                placeholder="Select a branch"
                options={availableBranches.map((b) => b.name)}
                status={
                  create.error
                    ? { type: "error", message: create.error }
                    : undefined
                }
              />
            )}
          </CreatePanel>
        )
      }
    >
      <PickerTrigger icon={FolderGit2} label="Worktree" name={label} />
    </Popover>
  );
}
