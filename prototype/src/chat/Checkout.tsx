// The checkout bar under the composer: worktree picker on the start, branch
// picker on the end (real app: features/chat/components/composer/checkout/).
// Each picker is a ghost Button opening a Popover above it, the same surface
// as the composer's other popups. Popover content follows the real PickerList:
// search, a compact List (current item marked, delete revealed on hover, the
// DeletableRow confirm inline), then a "New …" action at the foot. Creating
// happens inline in the same popover: the list view swaps for a short form,
// Cancel swaps back, so the flow stays anchored to the bar.
import { useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { Popover } from "@astryxdesign/core/Popover";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, Stack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useContainerReveal } from "@astryxdesign/core/hooks";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { BranchIcon, WorktreeIcon } from "./icons";

export type WorktreeView = "list" | "new" | "new-existing" | "busy";
export type BranchView = "list" | "new" | "error";

export interface CheckoutState {
  worktree: string;
  branch: string;
  /** Which picker starts open (routes for the mockups). */
  open?: "worktree" | "branch";
  worktreeView?: WorktreeView;
  branchView?: BranchView;
  /** The conversation has started: the worktree can't change any more. */
  isWorktreeLocked?: boolean;
  /** Mockup data: the project has no branches free for a new worktree. */
  hasNoUnattached?: boolean;
}

const WORKTREES = [
  { name: "primary", branch: "astryx-migration", isDirty: false },
  { name: "task-42", branch: "task/42-astryx-board", isDirty: false },
  { name: "task-38", branch: "task/38-split-preferences", isDirty: true },
  { name: "task-40", branch: "task/40-terminal-font", isDirty: false },
];
const BRANCHES = ["astryx-migration", "master", "task/42-astryx-board", "task/38-split-preferences", "task/40-terminal-font", "fix/acp-restore"];
const UNATTACHED = ["master", "fix/acp-restore"];

const PANEL_WIDTH = 340;

const styles = stylex.create({
  // Keeps the check's box on every row so labels line up.
  hidden: { visibility: "hidden" },
});

function SearchField({ placeholder }: { placeholder: string }) {
  const [q, setQ] = useState("");
  return <TextInput label={placeholder} isLabelHidden size="sm" startIcon={MagnifyingGlassIcon} placeholder={placeholder} value={q} onChange={setQ} />;
}

/** A picker row: current item checked, delete revealed on hover / focus. */
function PickerRow({
  label,
  description,
  isCurrent,
  canDelete = true,
}: {
  label: string;
  description?: string;
  isCurrent: boolean;
  canDelete?: boolean;
}) {
  const { getContainerProps, getContentRevealProps } = useContainerReveal();
  return (
    <Stack {...getContainerProps({ hoverDelay: 120 })}>
      <ListItem
        label={label}
        description={description}
        isSelected={isCurrent}
        onClick={() => {}}
        startContent={<Icon icon={CheckIcon} size="sm" xstyle={isCurrent ? undefined : styles.hidden} />}
        endContent={
          canDelete && !isCurrent ? (
            <HStack as="span" {...getContentRevealProps()}>
              <IconButton variant="ghost" size="sm" label={`Delete ${label}`} icon={<Icon icon={TrashIcon} size="sm" />} />
            </HStack>
          ) : undefined
        }
      />
    </Stack>
  );
}

/** DeletableRow's confirm, inline in place of the row (dirty worktree). */
function ForceDeleteRow({ name }: { name: string }) {
  return (
    <VStack gap={2} paddingInline={3} paddingBlock={2}>
      <Text type="supporting">
        <Text weight="semibold" as="span">{name}</Text> has uncommitted changes. Deleting it throws them away.
      </Text>
      <HStack gap={1} hAlign="end">
        <Button label="Cancel" variant="ghost" size="sm" />
        <Button label="Force delete" variant="destructive" size="sm" icon={<Icon icon={TrashIcon} size="sm" />} />
      </HStack>
    </VStack>
  );
}

function PickerList({ search, children, createLabel, onCreate }: { search: string; children: ReactNode; createLabel: string; onCreate: () => void }) {
  return (
    <VStack gap={2}>
      <SearchField placeholder={search} />
      <List density="compact" edge="flush">
        {children}
      </List>
      <Divider />
      <Button label={createLabel} variant="ghost" size="sm" icon={<Icon icon={PlusIcon} size="sm" />} onClick={onCreate} />
    </VStack>
  );
}

/** The inline create form's frame: back + title, fields, Cancel / Create. */
function CreatePanel({
  title,
  children,
  isBusy,
  canCreate = true,
  onBack,
}: {
  title: string;
  children: ReactNode;
  isBusy?: boolean;
  canCreate?: boolean;
  onBack: () => void;
}) {
  return (
    <VStack gap={3}>
      <HStack gap={1} vAlign="center">
        <IconButton variant="ghost" size="sm" label="Back" icon={<Icon icon={ArrowLeftIcon} size="sm" />} onClick={onBack} />
        <Heading level={5}>{title}</Heading>
      </HStack>
      {children}
      <HStack gap={2} hAlign="end">
        <Button label="Cancel" variant="ghost" size="sm" onClick={onBack} isDisabled={isBusy} />
        <Button label={isBusy ? "Creating…" : "Create"} variant="primary" size="sm" isLoading={isBusy} isDisabled={!canCreate} />
      </HStack>
    </VStack>
  );
}

function BranchFields({ name, error }: { name: string; error?: string }) {
  const [n, setN] = useState(name);
  const [base, setBase] = useState("astryx-migration");
  return (
    <VStack gap={3}>
      <TextInput
        label="New branch name"
        size="sm"
        placeholder="my-feature"
        value={n}
        onChange={setN}
        hasAutoFocus
        status={error ? { type: "error", message: error } : undefined}
      />
      <Selector label="Base branch" size="sm" value={base} onChange={(v) => setBase(v!)} options={BRANCHES} />
    </VStack>
  );
}

function WorktreePanel({ initialView, hasNoUnattached }: { initialView: WorktreeView; hasNoUnattached?: boolean }) {
  const [view, setView] = useState<WorktreeView>(initialView);
  const [mode, setMode] = useState(initialView === "new-existing" ? "existing" : "new");
  const [existing, setExisting] = useState<string | null>(null);
  if (view === "list") {
    return (
      <PickerList search="Search worktrees..." createLabel="New worktree…" onCreate={() => setView("new")}>
        {WORKTREES.map((w) =>
          w.isDirty ? (
            <ForceDeleteRow key={w.name} name={w.name} />
          ) : (
            <PickerRow key={w.name} label={w.name} description={w.branch} isCurrent={w.name === "task-42"} canDelete={w.name !== "primary"} />
          ),
        )}
      </PickerList>
    );
  }
  const unattached = hasNoUnattached ? [] : UNATTACHED;
  return (
    <CreatePanel title="New worktree" isBusy={view === "busy"} canCreate={mode === "new" || unattached.length > 0} onBack={() => setView("list")}>
      <SegmentedControl label="Branch" value={mode} onChange={setMode} size="sm" layout="fill">
        <SegmentedControlItem label="New branch" value="new" />
        <SegmentedControlItem label="Existing branch" value="existing" />
      </SegmentedControl>
      {mode === "new" ? (
        <BranchFields name={view === "busy" ? "board-keyboard-moves" : ""} />
      ) : unattached.length === 0 ? (
        <VStack gap={1} paddingBlock={2}>
          <Text weight="semibold">No unattached branches</Text>
          <Text type="supporting" color="secondary">
            Every branch already has a worktree. Make a new branch instead.
          </Text>
        </VStack>
      ) : (
        <Selector label="Branch" size="sm" placeholder="Select a branch" value={existing} hasClear onChange={setExisting} options={unattached} />
      )}
    </CreatePanel>
  );
}

function BranchPanel({ initialView }: { initialView: BranchView }) {
  const [view, setView] = useState<BranchView>(initialView);
  if (view === "list") {
    return (
      <PickerList search="Search branches..." createLabel="New branch…" onCreate={() => setView("new")}>
        {BRANCHES.map((b) => (
          <PickerRow key={b} label={b} isCurrent={b === "task/42-astryx-board"} canDelete={b !== "master"} />
        ))}
      </PickerList>
    );
  }
  return (
    <CreatePanel title="New branch" onBack={() => setView("list")}>
      {view === "error" ? (
        <BranchFields name="task/42-astryx-board" error="A branch named 'task/42-astryx-board' already exists." />
      ) : (
        <BranchFields name="" />
      )}
    </CreatePanel>
  );
}

function PickerTrigger({ icon, label, name, isDisabled, tooltip }: { icon: typeof BranchIcon; label: string; name: string; isDisabled?: boolean; tooltip?: string }) {
  return (
    <Button
      label={`${label}: ${name}`}
      variant="ghost"
      size="sm"
      icon={<Icon icon={icon} size="sm" />}
      endContent={<Icon icon={ChevronDownIcon} size="sm" />}
      isDisabled={isDisabled}
      tooltip={tooltip}
    >
      {name}
    </Button>
  );
}

export default function CheckoutBar({ worktree, branch, open, worktreeView = "list", branchView = "list", isWorktreeLocked, hasNoUnattached }: CheckoutState) {
  const [isWorktreeOpen, setWorktreeOpen] = useState(open === "worktree");
  const [isBranchOpen, setBranchOpen] = useState(open === "branch");
  return (
    <HStack hAlign="between" vAlign="center" paddingInline={1}>
      {isWorktreeLocked ? (
        <PickerTrigger icon={WorktreeIcon} label="Worktree" name={worktree} isDisabled tooltip="The worktree is fixed once the conversation has started" />
      ) : (
        <Popover
          label="Worktrees"
          placement="above"
          alignment="start"
          width={PANEL_WIDTH}
          isOpen={isWorktreeOpen}
          onOpenChange={setWorktreeOpen}
          content={<WorktreePanel initialView={worktreeView} hasNoUnattached={hasNoUnattached} />}
        >
          <PickerTrigger icon={WorktreeIcon} label="Worktree" name={worktree} />
        </Popover>
      )}
      <Popover
        label="Branches"
        placement="above"
        alignment="end"
        width={PANEL_WIDTH}
        isOpen={isBranchOpen}
        onOpenChange={setBranchOpen}
        content={<BranchPanel initialView={branchView} />}
      >
        <PickerTrigger icon={BranchIcon} label="Branch" name={branch} />
      </Popover>
    </HStack>
  );
}
