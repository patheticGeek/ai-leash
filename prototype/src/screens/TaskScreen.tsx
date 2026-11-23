// Task view — the work-item-detail template in the board area: its
// LayoutHeader (padding 6, divider) with breadcrumb, Heading 1 title, header
// actions and the inline-editable Selector row; content sections (padding 6)
// split by Dividers; and the end LayoutPanel rail (340, padding 6, gap 10
// between groups). Our sections replace its Subtasks / Attachments: "Its
// chat" (the task chat's live state) and the Activity feed, which keeps the
// template's byline + muted comment Card shape.
import { useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader, LayoutPanel, Section } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Markdown } from "@astryxdesign/core/Markdown";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Token } from "@astryxdesign/core/Token";
import { rtlStyles } from "@astryxdesign/core/utils";
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  PencilIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { COLUMNS, EPICS, epicColor } from "../data";
import AppFrame from "../shell/AppFrame";
import TitleBar from "../shell/TitleBar";
import BoardScreen from "./BoardScreen";

const styles = stylex.create({
  breadcrumbRule: { height: 12 },
});

const STATUS_OPTIONS = COLUMNS.map((c) => ({
  value: c.id,
  label: c.title,
  icon: <StatusDot variant={c.dot} label={c.title} />,
}));

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent", badge: "error" },
  { value: "high", label: "High", badge: "orange" },
  { value: "medium", label: "Medium", badge: "warning" },
  { value: "low", label: "Low", badge: "teal" },
] as const;

function PriorityBadge({ value }: { value: string }) {
  const o = PRIORITY_OPTIONS.find((p) => p.value === value) ?? PRIORITY_OPTIONS[3];
  return <Badge variant={o.badge} label={o.label} />;
}

const EFFORTS = ["XS", "S", "M", "L", "XL"];
const EPIC_OPTIONS = [
  { value: "none", label: "No epic" },
  ...EPICS.map((e) => ({ value: e.name, label: e.name })),
];

/** The template's inline-editable header row, reused by the dialog. */
function FieldRow({ hasLabels, isStarted = true }: { hasLabels?: boolean; isStarted?: boolean }) {
  const [status, setStatus] = useState(isStarted ? "in_progress" : "todo");
  const [priority, setPriority] = useState(isStarted ? "high" : "low");
  const [effort, setEffort] = useState(isStarted ? "L" : "M");
  const [epic, setEpic] = useState(isStarted ? "Astryx migration" : "Project board");
  return (
    <HStack gap={1} vAlign="end" wrap="wrap">
      <Selector label="Status" isLabelHidden={!hasLabels} value={status} onChange={(v) => setStatus(v!)} options={STATUS_OPTIONS} />
      <Selector
        label="Priority"
        isLabelHidden={!hasLabels}
        value={priority}
        onChange={(v) => setPriority(v!)}
        options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
        renderValue={(o) => <PriorityBadge value={o.value} />}
        renderOption={(o) => <PriorityBadge value={o.value} />}
      />
      <Selector
        label="Effort"
        isLabelHidden={!hasLabels}
        value={effort}
        onChange={(v) => setEffort(v!)}
        options={EFFORTS.map((e) => ({ value: e, label: hasLabels ? e : `Effort ${e}` }))}
      />
      <Selector
        label="Epic"
        isLabelHidden={!hasLabels}
        value={epic}
        onChange={(v) => setEpic(v!)}
        options={EPIC_OPTIONS}
        renderValue={(o) => (o.value === "none" ? <Text>No epic</Text> : <Token size="sm" label={o.label as string} color={epicColor(o.value)} />)}
      />
    </HStack>
  );
}

function SectionHeader({ title, level = 2, action }: { title: string; level?: 2 | 3; action?: ReactNode }) {
  return (
    <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
      <Heading level={level}>{title}</Heading>
      {action}
    </HStack>
  );
}

function PageHeader() {
  return (
    <LayoutHeader padding={6} hasDivider>
      <VStack gap={4}>
        <HStack gap={4} vAlign="start" hAlign="between">
          <VStack gap={2}>
            <HStack gap={4} vAlign="center" wrap="wrap">
              <Link href="#/board" type="supporting" color="secondary">
                <HStack as="span" gap={1} vAlign="center">
                  <Icon icon={ArrowLeftIcon} size="sm" xstyle={rtlStyles.mirror} />
                  ai-leash board
                </HStack>
              </Link>
              <Divider orientation="vertical" xstyle={styles.breadcrumbRule} />
              <Text type="supporting" color="secondary">
                #42
              </Text>
              <Divider orientation="vertical" xstyle={styles.breadcrumbRule} />
              <Text type="supporting" color="secondary">
                Astryx migration
              </Text>
            </HStack>
            <Heading level={1} maxLines={2}>
              Astryx: board on the kanban template
            </Heading>
          </VStack>
          <HStack gap={1}>
            <IconButton label="Edit" variant="secondary" icon={<Icon icon={PencilIcon} size="sm" />} />
            <MoreMenu label="Task actions" items={[{ label: "Move to Review" }, { label: "Finish task" }, { type: "divider" }, { label: "Delete", variant: "destructive" }]} />
            <Button label="Open its chat" variant="primary" icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />} />
          </HStack>
        </HStack>
        <FieldRow />
      </VStack>
    </LayoutHeader>
  );
}

function DescriptionSection() {
  return (
    <Section padding={6}>
      <VStack gap={4}>
        <SectionHeader title="Description" />
        <Markdown>{`Rebuild \`BoardView\` on the kanban-board template: a \`LayoutHeader\` toolbar, muted column cards with a status dot and count, and cards with number, priority and effort.

Keep dnd-kit for dragging. Add **group by epic** as swimlanes with the epic label pinned left while the board scrolls sideways.

#### Done when
- Columns and cards match the template's spacing
- Dragging between lanes changes a task's epic
- \`docs/features/project-board.md\` describes the new board`}</Markdown>
      </VStack>
    </Section>
  );
}

function ChatSection() {
  return (
    <Section padding={6}>
      <VStack gap={4}>
        <SectionHeader
          title="Its chat"
          action={
            <HStack gap={2}>
              <Button label="Stop" icon={<Icon icon={StopIcon} size="sm" />} />
              <Button label="Open its chat" />
            </HStack>
          }
        />
        <HStack gap={3} vAlign="center">
          <StatusDot variant="accent" isPulsing label="Working" />
          <Text weight="semibold">Working for 3:12</Text>
          <Text type="supporting" color="secondary">
            edit src/features/board/BoardView.tsx · 2 sub-agents running
          </Text>
        </HStack>
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            Last reply · <Timestamp value="2026-11-23T10:07:00" format="time" type="supporting" color="secondary" />
          </Text>
          <Card variant="muted" padding={3}>
            <Text>
              The board now renders on the template's frame: a LayoutHeader toolbar, one muted Card per column with a
              status dot and count, and cards with number, priority and effort.
            </Text>
          </Card>
        </VStack>
      </VStack>
    </Section>
  );
}

const ACTIVITY = [
  { id: 1, author: "Project chat", kind: "event", time: "09:31", body: "created this task in Todo" },
  { id: 2, author: "Project chat", kind: "event", time: "09:31", body: "started it with Claude Code · Opus 5.5" },
  { id: 3, author: "ai leash", kind: "event", time: "09:31", body: "created worktree task-42 on branch task/42-astryx-board" },
  { id: 4, author: "#42", kind: "comment", time: "10:07", body: "Columns done. Working on the epic swimlanes next." },
  { id: 5, author: "Project chat", kind: "comment", time: "10:09", body: "Keep the epic label pinned left while the board scrolls sideways." },
] as const;

function ActivitySection() {
  return (
    <Section padding={6}>
      <VStack gap={10}>
        <SectionHeader title="Activity" />
        <VStack gap={6}>
          {ACTIVITY.map((e) => (
            <HStack key={e.id} gap={3} vAlign="start">
              <Avatar name={e.author} size="sm" />
              <StackItem size="fill">
                <VStack gap={1}>
                  <HStack gap={2} vAlign="center">
                    <Text weight="semibold">{e.author}</Text>
                    {e.kind === "event" && (
                      <Text type="supporting" color="secondary">
                        {e.body}
                      </Text>
                    )}
                    <StackItem size="fill" />
                    <Timestamp value={`2026-11-23T${e.time}:00`} format="time" type="supporting" color="secondary" />
                  </HStack>
                  {e.kind === "comment" && (
                    <Card variant="muted" padding={3}>
                      <Text>{e.body}</Text>
                    </Card>
                  )}
                </VStack>
              </StackItem>
            </HStack>
          ))}
        </VStack>
      </VStack>
    </Section>
  );
}

function DetailsPanel() {
  return (
    <VStack gap={10}>
      <VStack gap={4}>
        <SectionHeader title="Details" level={3} />
        <MetadataList>
          <MetadataListItem label="Created">
            <Timestamp value="2026-11-23T09:31:00" format="date" type="body" color="primary" />
          </MetadataListItem>
          <MetadataListItem label="Started">
            <Timestamp value="2026-11-23T09:31:00" format="time" type="body" color="primary" />
          </MetadataListItem>
          <MetadataListItem label="Created by">
            <Text>Project chat</Text>
          </MetadataListItem>
        </MetadataList>
      </VStack>
      <VStack gap={4}>
        <SectionHeader title="Agent" level={3} />
        <MetadataList>
          <MetadataListItem label="Agent">
            <Text>Claude Code</Text>
          </MetadataListItem>
          <MetadataListItem label="Model">
            <Text>Opus 5.5</Text>
          </MetadataListItem>
          <MetadataListItem label="Thinking">
            <Text>High</Text>
          </MetadataListItem>
          <MetadataListItem label="Permission">
            <Text>Accept edits</Text>
          </MetadataListItem>
        </MetadataList>
      </VStack>
      <VStack gap={4}>
        <SectionHeader title="Checkout" level={3} />
        <MetadataList>
          <MetadataListItem label="Worktree">
            <Text>task-42</Text>
          </MetadataListItem>
          <MetadataListItem label="Branch">
            <Text>task/42-astryx-board</Text>
          </MetadataListItem>
          <MetadataListItem label="Project chat">
            <Link href="#">Following · Hand back</Link>
          </MetadataListItem>
        </MetadataList>
      </VStack>
    </VStack>
  );
}

export function TaskViewScreen() {
  return (
    <AppFrame
      selection={{ kind: "board", project: "ai-leash" }}
      titleBar={
        <TitleBar
          crumbs={[{ label: "ai-leash", href: "#/new" }, { label: "Board", href: "#/board" }, { label: "#42 Astryx: board on the kanban template" }]}
          controls={
            <SegmentedControl label="Board layout" value="board" onChange={() => {}} size="sm">
              <SegmentedControlItem label="Board" value="board" />
              <SegmentedControlItem label="Both" value="both" />
              <SegmentedControlItem label="Chat" value="chat" />
            </SegmentedControl>
          }
        />
      }
    >
      <Layout
        height="fill"
        contentWidth={1260}
        header={<PageHeader />}
        content={
          <LayoutContent padding={6} role="main">
            <VStack gap={6}>
              <DescriptionSection />
              <Divider />
              <ChatSection />
              <Divider />
              <ActivitySection />
            </VStack>
          </LayoutContent>
        }
        end={
          <LayoutPanel width={340} padding={6} role="complementary" hasDivider>
            <DetailsPanel />
          </LayoutPanel>
        }
      />
    </AppFrame>
  );
}

// ---------------------------------------------------------------------------
// Task modals. Both follow the DialogFormDialog block (Layout in the Dialog:
// DialogHeader / LayoutContent / LayoutFooter with actions on the end) and
// carry work-item-detail's content. purpose="form": inputs, so a stray
// backdrop click doesn't throw edits away.

const AGENT_FIELDS = [
  { label: "Agent", options: ["Claude Code", "GitHub Copilot", "Local Ollama"] },
  { label: "Model", options: ["Opus 5.5", "Sonnet 5.5", "Haiku 5.5"] },
  { label: "Thinking", options: ["Low", "Medium", "High", "Max"] },
  { label: "Permission", options: ["Ask every time", "Accept edits", "Plan only", "Bypass permissions"] },
];

function AgentSelect({ label, options, value = "default" }: { label: string; options: string[]; value?: string }) {
  const [v, setV] = useState(value);
  return (
    <Selector
      label={label}
      value={v}
      onChange={(x) => setV(x!)}
      width="100%"
      options={[{ value: "default", label: "Board default" }, { type: "divider" }, ...options]}
    />
  );
}

/** Status / priority / effort / epic as labelled fields on one aligned grid. */
function FieldGrid() {
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("low");
  const [effort, setEffort] = useState("M");
  const [epic, setEpic] = useState("Project board");
  return (
    <Grid columns={4} gap={3}>
      <Selector label="Status" value={status} onChange={(v) => setStatus(v!)} options={STATUS_OPTIONS} width="100%" />
      <Selector
        label="Priority"
        value={priority}
        onChange={(v) => setPriority(v!)}
        width="100%"
        options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
        renderValue={(o) => <PriorityBadge value={o.value} />}
        renderOption={(o) => <PriorityBadge value={o.value} />}
      />
      <Selector label="Effort" value={effort} onChange={(v) => setEffort(v!)} options={EFFORTS} width="100%" />
      <Selector
        label="Epic"
        value={epic}
        onChange={(v) => setEpic(v!)}
        options={EPIC_OPTIONS}
        width="100%"
        renderValue={(o) => (o.value === "none" ? <Text>No epic</Text> : <Token size="sm" label={o.label as string} color={epicColor(o.value)} />)}
      />
    </Grid>
  );
}

const NEW_DESCRIPTION = `Move the focused card one column left or right with **Alt+←/→**, and announce the move to screen readers.

- Works in group-by-epic swimlanes too
- \`docs/features/project-board.md\` lists the shortcut`;

function NewTaskBody() {
  const [title, setTitle] = useState("Board: keyboard moves between columns");
  const [description, setDescription] = useState(NEW_DESCRIPTION);
  return (
    <Layout
      header={<DialogHeader title="New task" subtitle="ai-leash board" onOpenChange={() => {}} />}
      content={
        <LayoutContent>
          <VStack gap={4}>
            <TextInput label="Title" isRequired value={title} onChange={setTitle} />
            <TextArea
              label="Description"
              description="Markdown. The task's chat gets this as its first message."
              value={description}
              onChange={setDescription}
              rows={6}
            />
            <FieldGrid />
            <Divider />
            <VStack gap={3}>
              <VStack gap={0.5}>
                <Heading level={4}>Who works on it</Heading>
                <Text type="supporting" color="secondary">
                  Optional. Anything left on Board default uses the board's settings when the task starts.
                </Text>
              </VStack>
              <Grid columns={2} gap={3}>
                {AGENT_FIELDS.map((f) => (
                  <AgentSelect key={f.label} {...f} />
                ))}
              </Grid>
            </VStack>
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" variant="secondary" />
            <Button label="Create task" variant="primary" />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}

export function TaskNewScreen() {
  return (
    <>
      <BoardScreen variant="board" />
      <Dialog isOpen onOpenChange={() => {}} purpose="form" width={640}>
        <NewTaskBody />
      </Dialog>
    </>
  );
}

// Task details: work-item-detail inside the dialog. The template's header
// (ref, Heading title, inline-editable Selector row), its content sections
// split by Dividers, and its end rail of MetadataLists; footer = Delete on the
// start (destructive, confirmed by an AlertDialog), Close on the end.

function ChatState({ isStarted }: { isStarted: boolean }) {
  if (!isStarted) {
    return (
      <Card variant="muted" padding={4}>
        <HStack gap={3} vAlign="center">
          <StatusDot variant="neutral" label="Not started" />
          <StackItem size="fill">
            <VStack gap={0}>
              <Text weight="semibold">Not started</Text>
              <Text type="supporting" color="secondary">
                Starting creates worktree task-47 and opens its chat.
              </Text>
            </VStack>
          </StackItem>
          <Button label="Start" variant="primary" icon={<Icon icon={PlayIcon} size="sm" />} />
        </HStack>
      </Card>
    );
  }
  return (
    <Card variant="muted" padding={4}>
      <VStack gap={3}>
        <HStack gap={3} vAlign="center">
          <StatusDot variant="accent" isPulsing label="Working" />
          <StackItem size="fill">
            <VStack gap={0}>
              <Text weight="semibold" hasTabularNumbers>
                Working for 3:12
              </Text>
              <Text type="supporting" color="secondary">
                edit src/features/board/BoardView.tsx · 2 sub-agents running
              </Text>
            </VStack>
          </StackItem>
          <Button label="Stop" icon={<Icon icon={StopIcon} size="sm" />} />
          <Button label="Open chat" variant="primary" icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />} />
        </HStack>
        <Divider />
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            Last reply · <Timestamp value="2026-11-23T10:07:00" format="time" type="supporting" color="secondary" />
          </Text>
          <Text>Columns done. Working on the epic swimlanes next.</Text>
        </VStack>
      </VStack>
    </Card>
  );
}

function DetailsRail({ isStarted }: { isStarted: boolean }) {
  // Inline padding only: the rail's first heading lines up with the field row,
  // which starts flush under the dialog header like the content column.
  return (
    <VStack gap={6} paddingInline={4}>
      <VStack gap={3}>
        <Heading level={4}>Checkout</Heading>
        <MetadataList>
          <MetadataListItem label="Worktree">
            <Text>{isStarted ? "task-42" : "Created on start"}</Text>
          </MetadataListItem>
          <MetadataListItem label="Branch">
            <Text>{isStarted ? "task/42-astryx-board" : "—"}</Text>
          </MetadataListItem>
        </MetadataList>
      </VStack>
      <VStack gap={3}>
        <Heading level={4}>Agent</Heading>
        {isStarted ? (
          <MetadataList>
            <MetadataListItem label="Agent">
              <Text>Claude Code</Text>
            </MetadataListItem>
            <MetadataListItem label="Model">
              <Text>Opus 5.5</Text>
            </MetadataListItem>
            <MetadataListItem label="Thinking">
              <Text>High</Text>
            </MetadataListItem>
            <MetadataListItem label="Permission">
              <Text>Accept edits</Text>
            </MetadataListItem>
          </MetadataList>
        ) : (
          <VStack gap={3}>
            {AGENT_FIELDS.map((f) => (
              <AgentSelect key={f.label} {...f} />
            ))}
          </VStack>
        )}
      </VStack>
      <VStack gap={3}>
        <Heading level={4}>Details</Heading>
        <MetadataList>
          <MetadataListItem label="Created">
            <Timestamp value="2026-11-23T09:31:00" format="date" type="body" color="primary" />
          </MetadataListItem>
          <MetadataListItem label="Created by">
            <Text>Project chat</Text>
          </MetadataListItem>
        </MetadataList>
      </VStack>
    </VStack>
  );
}

const DETAILS = {
  started: {
    ref: "#42",
    title: "Astryx: board on the kanban template",
    description: `Rebuild \`BoardView\` on the kanban-board template: a \`LayoutHeader\` toolbar, muted column cards with a status dot and count, and cards with number, priority and effort.

Keep dnd-kit for dragging. Add **group by epic** as swimlanes with the epic label pinned left while the board scrolls sideways.`,
  },
  todo: {
    ref: "#47",
    title: "Board: keyboard moves between columns",
    description: NEW_DESCRIPTION,
  },
};

function TaskDetailsBody({ isStarted }: { isStarted: boolean }) {
  const t = DETAILS[isStarted ? "started" : "todo"];
  return (
    <Layout
      header={
        <DialogHeader
          title={t.title}
          subtitle={`${t.ref} · ai-leash board`}
          endContent={<MoreMenu label="Task actions" items={[{ label: "Copy link to task" }, { label: "Move to Review" }, { label: "Finish task" }]} />}
          onOpenChange={() => {}}
        />
      }
      content={
        <LayoutContent>
          <VStack gap={6}>
            <FieldRow isStarted={isStarted} />
            <VStack gap={2}>
              <HStack gap={2} vAlign="center" hAlign="between">
                <Heading level={4}>Description</Heading>
                <IconButton variant="ghost" size="sm" label="Edit description" icon={<Icon icon={PencilIcon} size="sm" />} />
              </HStack>
              <Markdown density="compact">{t.description}</Markdown>
            </VStack>
            <Divider />
            <VStack gap={2}>
              <Heading level={4}>Its chat</Heading>
              <ChatState isStarted={isStarted} />
            </VStack>
          </VStack>
        </LayoutContent>
      }
      end={
        <LayoutPanel width={300} padding={0} hasDivider>
          <DetailsRail isStarted={isStarted} />
        </LayoutPanel>
      }
      footer={
        <LayoutFooter>
          <HStack gap={2} hAlign="between">
            <Button label="Delete task" variant="destructive" icon={<Icon icon={TrashIcon} size="sm" />} />
            <Button label="Close" variant="secondary" />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}

export function TaskDetailsScreen({ isStarted = true }: { isStarted?: boolean }) {
  return (
    <>
      <BoardScreen variant="board" />
      <Dialog isOpen onOpenChange={() => {}} purpose="form" width={960}>
        <TaskDetailsBody isStarted={isStarted} />
      </Dialog>
    </>
  );
}
