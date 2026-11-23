import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import {
  ChatLayout,
  ChatMessage,
  ChatMessageList,
} from "@astryxdesign/core/Chat";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import {
  ChevronDown,
  Inbox,
  Layers,
  MessageSquare,
  Play,
  Plus,
  Settings2,
} from "lucide-react";
import { Composer } from "../chat/Composer";
import { AssistantFooter, AssistantText, NoteRow, UserMessage } from "../chat/Transcript";
import {
  COLUMNS,
  EPICS,
  epicColor,
  PRIORITY_META,
  type Status,
  TASKS,
  type Task,
} from "../data";
import AppFrame from "../shell/AppFrame";
import type { BoardLayout } from "../shell/TitleBar";

const COLUMN_WIDTH = 264;
const LANE_LABEL_WIDTH = 168;

const styles = stylex.create({
  scroller: {
    height: "100%",
    overflow: "auto",
    padding: spacingVars["--spacing-3"],
  },
  column: { width: COLUMN_WIDTH, flexShrink: 0, height: "100%" },
  cell: {
    width: COLUMN_WIDTH,
    flexShrink: 0,
    padding: spacingVars["--spacing-1-5"],
    borderRadius: radiusVars["--radius-container"],
    backgroundColor: colorVars["--color-background-muted"],
  },
  card: { cursor: "grab", userSelect: "none" },
  grow: { minWidth: 0, flex: 1 },
  // Group by epic: the lane's label stays put while the lanes scroll sideways.
  laneLabel: {
    position: "sticky",
    insetInlineStart: `calc(-1 * ${spacingVars["--spacing-3"]})`,
    zIndex: 1,
    width: LANE_LABEL_WIDTH,
    flexShrink: 0,
    paddingBlock: spacingVars["--spacing-2"],
    paddingInline: spacingVars["--spacing-2"],
    backgroundColor: colorVars["--color-background-body"],
  },
  headRow: {
    position: "sticky",
    insetBlockStart: `calc(-1 * ${spacingVars["--spacing-3"]})`,
    zIndex: 2,
    paddingBlock: spacingVars["--spacing-1"],
    backgroundColor: colorVars["--color-background-body"],
  },
  headSpacer: { width: LANE_LABEL_WIDTH, flexShrink: 0 },
  ghost: {
    height: 72,
    borderRadius: radiusVars["--radius-container"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "dashed",
    borderColor: colorVars["--color-border-emphasized"],
  },
  toolbarDivider: { alignSelf: "stretch", height: "auto", marginBlock: spacingVars["--spacing-1"] },
  chatPanel: { height: "100%", minHeight: 0 },
  chatBody: { flex: 1, minHeight: 0 },
});

function TaskCard({ task }: { task: Task }) {
  const pr = PRIORITY_META[task.priority];
  return (
    <Card padding={2} xstyle={styles.card}>
      <VStack gap={1.5}>
        <HStack align="center" gap={1.5}>
          <Text type="supporting" color="secondary" hasTabularNumbers>
            #{task.number}
            {task.effort ? ` · ${task.effort}` : ""}
          </Text>
          <Token size="sm" color={pr.badge === "neutral" ? "gray" : pr.badge} label={pr.label} />
          <HStack xstyle={styles.grow} />
          <MoreMenu size="sm" label="Task actions" items={[{ label: "Open" }, { label: "Edit" }, { type: "divider" }, { label: "Delete", variant: "destructive" }]} />
        </HStack>
        <Text weight="medium" maxLines={2}>
          {task.title}
        </Text>
        <HStack align="center" gap={1}>
          {task.epic ? <Token size="sm" color={epicColor(task.epic)} label={task.epic} /> : <HStack />}
          <HStack xstyle={styles.grow} />
          {task.isWorking ? (
            <HStack align="center" gap={1}>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {task.elapsed}
              </Text>
              <Spinner size="sm" aria-label="Working" />
            </HStack>
          ) : null}
          {task.hasChat ? (
            <IconButton variant="ghost" size="sm" label="Open its chat" tooltip="Open its chat" icon={<Icon icon={MessageSquare} size="xsm" />} />
          ) : (
            <Button variant="ghost" size="sm" label="Start" icon={<Icon icon={Play} size="xsm" />} />
          )}
        </HStack>
      </VStack>
    </Card>
  );
}

function ColumnHeader({ id, count }: { id: Status; count: number }) {
  const meta = COLUMNS.find((c) => c.id === id)!;
  return (
    <HStack align="center" gap={2}>
      <StatusDot variant={meta.dot} label={`${meta.title} status`} />
      <Heading level={5} accessibilityLevel={3}>
        {meta.title}
      </Heading>
      <Text type="supporting" color="secondary" hasTabularNumbers>
        {count}
      </Text>
      <HStack xstyle={styles.grow} />
      <IconButton variant="ghost" size="sm" label={`New task in ${meta.title}`} icon={<Icon icon={Plus} size="xsm" />} />
    </HStack>
  );
}

function Columns({ statuses }: { statuses: Status[] }) {
  return (
    <HStack gap={2} align="start" xstyle={styles.scroller}>
      {statuses.map((s) => {
        const tasks = TASKS.filter((t) => t.status === s);
        return (
          <Card key={s} variant="muted" padding={0} xstyle={styles.column}>
            <Layout
              height="fill"
              header={
                <LayoutHeader hasDivider padding={2}>
                  <ColumnHeader id={s} count={tasks.length} />
                </LayoutHeader>
              }
              content={
                <LayoutContent padding={1.5}>
                  {tasks.length === 0 ? (
                    <EmptyState isCompact icon={<Icon icon={Inbox} size="lg" color="secondary" />} title="Nothing here" description="Drag a task in or add one" />
                  ) : (
                    <VStack gap={1.5}>
                      {tasks.map((t) => (
                        <TaskCard key={t.number} task={t} />
                      ))}
                      {s === "done" && <Button variant="ghost" size="sm" label="Load 12 older" />}
                    </VStack>
                  )}
                </LayoutContent>
              }
            />
          </Card>
        );
      })}
    </HStack>
  );
}

function EpicLanes({ statuses }: { statuses: Status[] }) {
  const lanes = [...EPICS.map((e) => e.name), null];
  return (
    <VStack gap={2} xstyle={styles.scroller}>
      <HStack gap={2} xstyle={styles.headRow}>
        <HStack xstyle={styles.headSpacer} />
        {statuses.map((s) => (
          <HStack key={s} paddingInline={2} xstyle={styles.column}>
            <ColumnHeader id={s} count={TASKS.filter((t) => t.status === s).length} />
          </HStack>
        ))}
      </HStack>
      {lanes.map((epic) => {
        const laneTasks = TASKS.filter((t) => t.epic === epic);
        return (
          <HStack key={epic ?? "none"} gap={2} align="stretch">
            <VStack gap={0.5} xstyle={styles.laneLabel}>
              <HStack>
                {epic ? <Token color={epicColor(epic)} label={epic} /> : <Text color="secondary">No epic</Text>}
              </HStack>
              <Text type="supporting" color="secondary">
                {laneTasks.length} tasks
              </Text>
            </VStack>
            {statuses.map((s) => {
              const cell = laneTasks.filter((t) => t.status === s);
              const isDropTarget = epic === "Project board" && s === "review";
              return (
                <VStack key={s} gap={1.5} xstyle={styles.cell}>
                  {cell.map((t) => (
                    <TaskCard key={t.number} task={t} />
                  ))}
                  {isDropTarget && <VStack xstyle={styles.ghost} />}
                  {s === "done" && epic === null && <Button variant="ghost" size="sm" label="Load 12 older" />}
                </VStack>
              );
            })}
          </HStack>
        );
      })}
    </VStack>
  );
}

function BoardToolbar({ isGrouped, isDoneShown }: { isGrouped: boolean; isDoneShown: boolean }) {
  return (
    <Toolbar
      label="Board actions"
      gap={2}
      startContent={
        <>
          <Heading level={3} accessibilityLevel={1}>
            ai-leash board
          </Heading>
          <Selector label="Epic" isLabelHidden size="sm" variant="ghost" value="all" onChange={() => {}} options={[{ value: "all", label: "All epics" }, ...EPICS.map((e) => ({ value: e.name, label: e.name })), { value: "none", label: "No epic" }]} />
        </>
      }
      endContent={
        <HStack gap={2} align="center">
          <Switch label="Group by epic" size="sm" value={isGrouped} onChange={() => {}} />
          <Switch label="Show done" size="sm" value={isDoneShown} onChange={() => {}} />
          <Badge label={3} />
          <Divider orientation="vertical" variant="strong" xstyle={styles.toolbarDivider} />
          <Button variant="ghost" size="sm" label="Epics" icon={<Icon icon={Layers} size="sm" />} />
          <IconButton variant="ghost" size="sm" label="Board settings" tooltip="Board settings" icon={<Icon icon={Settings2} size="sm" />} />
          <Button variant="primary" size="sm" label="New task" icon={<Icon icon={Plus} size="sm" />} />
        </HStack>
      }
    />
  );
}

function ProjectChat() {
  return (
    <VStack xstyle={styles.chatPanel}>
      <LayoutHeader hasDivider padding={2}>
        <HStack align="center" gap={2}>
          <Icon icon={MessageSquare} size="sm" color="secondary" />
          <Text weight="semibold">Project chat</Text>
          <Text type="supporting" color="secondary">
            main checkout
          </Text>
        </HStack>
      </LayoutHeader>
      <ChatLayout
        density="compact"
        xstyle={styles.chatBody}
        composer={<Composer agent="Claude Code · Opus 5.5" mode="Default" placeholder="Plan work, or message a task by #number" />}
      >
        <ChatMessageList density="compact" gap={3}>
          <UserMessage time="09:30">{"Break the Astryx migration of the board and task views into tasks, one per surface."}</UserMessage>
          <ChatMessage sender="assistant">
            <AssistantText>{"Added **#42**, **#44** and **#45** to Todo under *Astryx migration*, and started **#42** with Claude Code · high. I'm following it."}</AssistantText>
            <AssistantFooter time="09:31" worked="48s" />
          </ChatMessage>
          <UserMessage from="#41 ACP: keep last model list" time="10:05">
            {"Blocked: `acp_catalog` drops the cached list when the agent times out. Keep the previous list, or show it greyed out?"}
          </UserMessage>
          <NoteRow from="#40 Terminal: honour code font size" first="Moved to Review." />
        </ChatMessageList>
      </ChatLayout>
    </VStack>
  );
}

function TaskDialog() {
  return (
    <Dialog isOpen onOpenChange={() => {}} purpose="form" width={720}>
      <VStack gap={3}>
        <DialogHeader title="New task" subtitle="ai-leash board" onOpenChange={() => {}} hasDivider={false} />
        <TextInput label="Title" isLabelHidden placeholder="What needs doing?" value="Astryx: side panel on the ide template" onChange={() => {}} />
        <HStack gap={1} wrap="wrap">
          <Selector label="Status" isLabelHidden size="sm" value="todo" onChange={() => {}} options={COLUMNS.map((c) => ({ value: c.id, label: c.title, icon: <StatusDot variant={c.dot} label={c.title} /> }))} />
          <Selector label="Priority" isLabelHidden size="sm" value="high" onChange={() => {}} options={Object.entries(PRIORITY_META).map(([v, m]) => ({ value: v, label: m.label }))} />
          <Selector label="Effort" isLabelHidden size="sm" value="L" onChange={() => {}} options={["Unsized", "XS", "S", "M", "L", "XL"].map((v) => ({ value: v, label: v === "Unsized" ? v : `Effort ${v}` }))} />
          <Selector label="Epic" isLabelHidden size="sm" value="Astryx migration" onChange={() => {}} options={[{ value: "none", label: "No epic" }, ...EPICS.map((e) => ({ value: e.name, label: e.name }))]} />
        </HStack>
        <TextArea
          label="Description"
          isLabelHidden
          rows={7}
          value={"Move SidePanel onto the ide template's inspector pane: pill TabList with the + picker, Files as a TreeList with a search box, and Actions and Sub agents as compact Lists.\n\nKeep tab drag between the centre and the panel working."}
          onChange={() => {}}
        />
        <VStack gap={2}>
          <HStack align="center" gap={1}>
            <Icon icon={ChevronDown} size="xsm" color="secondary" />
            <Text weight="medium">Agent</Text>
            <Text type="supporting" color="secondary">
              Anything left at Board default uses the board's settings
            </Text>
          </HStack>
          <HStack gap={1} wrap="wrap">
            <Selector label="Agent" size="sm" value="board" onChange={() => {}} options={[{ value: "board", label: "Board default" }, { value: "claude", label: "Claude Code" }]} />
            <Selector label="Model" size="sm" value="board" onChange={() => {}} options={[{ value: "board", label: "Board default" }]} />
            <Selector label="Thinking" size="sm" value="board" onChange={() => {}} options={[{ value: "board", label: "Board default" }]} />
            <Selector label="Permission" size="sm" value="board" onChange={() => {}} options={[{ value: "board", label: "Board default" }]} />
          </HStack>
        </VStack>
        <Divider />
        <HStack justify="end" gap={1}>
          <Button variant="ghost" label="Cancel" />
          <Button variant="primary" label="Create task" />
        </HStack>
      </VStack>
    </Dialog>
  );
}

export default function BoardScreen({
  layout,
  isGrouped = false,
  isDoneShown = false,
  isTaskDialogOpen = false,
}: {
  layout: BoardLayout;
  isGrouped?: boolean;
  isDoneShown?: boolean;
  isTaskDialogOpen?: boolean;
}) {
  const statuses = COLUMNS.map((c) => c.id).filter((s) => isDoneShown || s !== "done");
  return (
    <AppFrame
      project="ai-leash"
      title="Board"
      boardLayout={layout}
      selectedBoard="ai-leash"
      end={layout === "both" ? <ProjectChat /> : undefined}
      endWidth={420}
    >
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={2}>
            <BoardToolbar isGrouped={isGrouped} isDoneShown={isDoneShown} />
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0} isScrollable={false}>
            {isGrouped ? <EpicLanes statuses={statuses} /> : <Columns statuses={statuses} />}
          </LayoutContent>
        }
      />
      {isTaskDialogOpen && <TaskDialog />}
    </AppFrame>
  );
}
