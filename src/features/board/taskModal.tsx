// What the New task and Task details dialogs share: they're one design in
// three states (new / not started / started) — the DialogFormDialog block
// (a Layout in the Dialog: DialogHeader / LayoutContent / LayoutFooter)
// with the work-item-detail template's content inside: a title, the
// label-less field row, the description, and an end rail of MetadataLists.
// 1120 wide (the settings-dialog template's size); `purpose="form"` so a
// backdrop click can't drop edits.
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import * as stylex from "@stylexjs/stylex";
import { Flag, Layers, Scale } from "lucide-react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_EFFORTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "../../data/board";
import type {
  ConversationSummary,
  Epic,
  TaskEffort,
  TaskPriority,
  TaskStatus,
} from "../../lib/tauriApi";
import { useCurrentGitBranch } from "../../lib/useCurrentGitBranch";
import { EpicToken, PriorityBadge, STATUS_DOT } from "./TaskMeta";

const MODAL_WIDTH = 1120;
const RAIL_WIDTH = 320;

const styles = stylex.create({
  // The form wraps the dialog's whole Layout so Enter / Ctrl+Enter submit
  // from any field; it has to fill the dialog like the Layout would.
  form: { flex: 1, minHeight: 0, height: "100%" },
});

export function projectName(projectRoot: string): string {
  return projectRoot.split(/[\\/]/).filter(Boolean).pop() ?? projectRoot;
}

export function TaskModalFrame({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  endContent,
  main,
  rail,
  footer,
  onSubmit,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle: string;
  endContent?: ReactNode;
  main: ReactNode;
  rail: ReactNode;
  footer: ReactNode;
  // Wraps it all in a form: Enter in a field / Ctrl+Enter anywhere submits.
  onSubmit?: () => void;
}) {
  const layout = (
    <Layout
      header={
        <DialogHeader
          title={title}
          subtitle={subtitle}
          endContent={endContent}
          onOpenChange={onOpenChange}
        />
      }
      content={
        <LayoutContent>
          <VStack gap={5}>{main}</VStack>
        </LayoutContent>
      }
      end={
        <LayoutPanel width={RAIL_WIDTH} padding={0} hasDivider>
          <VStack gap={6} paddingInline={4}>
            {rail}
          </VStack>
        </LayoutPanel>
      }
      footer={<LayoutFooter>{footer}</LayoutFooter>}
    />
  );
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={MODAL_WIDTH}
      maxHeight="85dvh"
    >
      {onSubmit ? (
        <VStack
          as="form"
          xstyle={styles.form}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onSubmit();
          }}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
        >
          {layout}
        </VStack>
      ) : (
        layout
      )}
    </Dialog>
  );
}

// One titled group in the rail, or in the main column.
export function ModalSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" hAlign="between">
        <Heading level={4} weight="normal">
          {title}
        </Heading>
        {action}
      </HStack>
      {children}
    </VStack>
  );
}

export interface TaskFields {
  status: TaskStatus;
  priority: TaskPriority | null;
  effort: TaskEffort | null;
  epicId: string | null;
}

const STATUS_OPTIONS = TASK_STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
  icon: <StatusDot variant={STATUS_DOT[s]} label={STATUS_LABELS[s]} />,
}));

const PRIORITY_OPTIONS = TASK_PRIORITIES.map((p) => ({
  value: p,
  label: PRIORITY_LABELS[p],
}));

const EFFORT_OPTIONS = TASK_EFFORTS.map((e) => ({
  value: e,
  label: e.toUpperCase(),
}));

// The template's label-less field row: status (with its column's dot),
// priority (its Badge), effort and epic (its Token). Empty fields show an
// icon and a placeholder. `canClearPriority` is for drafting — a task
// always has a priority once it exists; effort and epic can be cleared
// any time.
export function TaskFieldRow({
  value,
  onChange,
  epics,
  canClearPriority,
}: {
  value: TaskFields;
  onChange: (patch: Partial<TaskFields>) => void;
  epics: Epic[];
  canClearPriority: boolean;
}) {
  const selectable = epics.filter((e) => !e.archived || e.id === value.epicId);
  const epicById = (id: string) => selectable.find((e) => e.id === id);
  return (
    <HStack gap={1} vAlign="center" wrap="wrap">
      <Selector
        label="Status"
        isLabelHidden
        value={value.status}
        onChange={(v) => onChange({ status: v as TaskStatus })}
        options={STATUS_OPTIONS}
      />
      {canClearPriority ? (
        <Selector
          label="Priority"
          isLabelHidden
          hasClear
          placeholder="Priority"
          startIcon={value.priority ? undefined : Flag}
          value={value.priority}
          onChange={(v) => onChange({ priority: v as TaskPriority | null })}
          options={PRIORITY_OPTIONS}
          renderValue={(o) => (
            <PriorityBadge priority={o.value as TaskPriority} />
          )}
          renderOption={(o) => (
            <PriorityBadge priority={o.value as TaskPriority} />
          )}
        />
      ) : (
        <Selector
          label="Priority"
          isLabelHidden
          value={value.priority ?? "medium"}
          onChange={(v) => onChange({ priority: v as TaskPriority })}
          options={PRIORITY_OPTIONS}
          renderValue={(o) => (
            <PriorityBadge priority={o.value as TaskPriority} />
          )}
          renderOption={(o) => (
            <PriorityBadge priority={o.value as TaskPriority} />
          )}
        />
      )}
      <Selector
        label="Effort"
        isLabelHidden
        hasClear
        placeholder="Effort"
        startIcon={Scale}
        value={value.effort}
        onChange={(v) => onChange({ effort: v as TaskEffort | null })}
        options={EFFORT_OPTIONS}
      />
      <Selector
        label="Epic"
        isLabelHidden
        hasClear
        placeholder="Epic"
        startIcon={value.epicId ? undefined : Layers}
        value={value.epicId}
        onChange={(v) => onChange({ epicId: v })}
        options={selectable.map((e) => ({ value: e.id, label: e.title }))}
        emptyText="No epics yet — add them from the board's Epics"
        renderValue={(o) => {
          const epic = epicById(o.value);
          return epic ? <EpicToken epic={epic} /> : <Text>{o.label}</Text>;
        }}
      />
    </HStack>
  );
}

function LiveBranch({ path }: { path: string }) {
  const branch = useCurrentGitBranch(path);
  return (
    <Text color={branch ? "primary" : "secondary"}>{branch ?? "Detached"}</Text>
  );
}

// The rail's Checkout group: where the task's chat runs. Before it starts
// that's still to come; after, the worktree (or the project's checkout)
// and what it has checked out, read live.
export function CheckoutSection({
  conversation,
  isStarted,
  projectRoot,
  sharedCheckout,
}: {
  conversation: ConversationSummary | undefined;
  isStarted: boolean;
  projectRoot: string;
  sharedCheckout: boolean;
}) {
  const worktree = conversation?.worktreePath ?? null;
  return (
    <ModalSection title="Checkout">
      <MetadataList>
        <MetadataListItem label="Worktree">
          {isStarted ? (
            <Text>{worktree ? projectName(worktree) : "Project checkout"}</Text>
          ) : (
            <Text color="secondary">
              {sharedCheckout
                ? "None — shares the project's"
                : "Created on start"}
            </Text>
          )}
        </MetadataListItem>
        {!sharedCheckout && (
          <MetadataListItem label="Branch">
            {isStarted ? (
              <LiveBranch path={worktree ?? projectRoot} />
            ) : (
              <Text color="secondary">Created on start</Text>
            )}
          </MetadataListItem>
        )}
      </MetadataList>
    </ModalSection>
  );
}
