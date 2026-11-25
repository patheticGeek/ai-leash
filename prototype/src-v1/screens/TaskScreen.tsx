import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Markdown } from "@astryxdesign/core/Markdown";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  GitBranch,
  Inbox,
  MessageSquare,
  Pencil,
  Square,
} from "lucide-react";
import { COLUMNS, EPICS, epicColor, PRIORITY_META } from "../data";
import AppFrame from "../shell/AppFrame";

const styles = stylex.create({
  rule: { height: 12 },
  grow: { minWidth: 0, flex: 1 },
});

const DESCRIPTION = `Rebuild \`src/features/board\` on the **kanban-board** template.

- Columns are muted \`Card\`s with a \`StatusDot\`, title and count in a \`LayoutHeader\`
- Cards show number, effort, priority and epic; a spinner and elapsed time while the task's chat works
- Keep **group by epic** (epic name pinned left while scrolling sideways), drag and drop, **Show done** and **Load older**

### Done when
- Dragging into another epic's lane changes the task's epic
- \`docs/features/project-board.md\` still describes what you see`;

// What happened to the task, from board events and the messages its chat
// and the project chat sent each other.
const ACTIVITY = [
  { icon: Inbox, who: "Project chat", what: "created this task in Todo", when: "09:31" },
  { icon: Bot, who: "Project chat", what: "started it with Claude Code · Opus 5.5 · high, following it", when: "09:31" },
  { icon: GitBranch, who: "ai leash", what: "created worktree task-42 on task/42-astryx-board", when: "09:31" },
  { icon: MessageSquare, who: "#42", what: "→ Project chat: “Columns done. Group by epic next — keep lanes collapsible?”", when: "10:07" },
  { icon: MessageSquare, who: "Project chat", what: "→ #42: “No, keep them open. Pin the epic name left.”", when: "10:08" },
];

function PageHeader() {
  return (
    <LayoutHeader padding={4} hasDivider>
      <VStack gap={3}>
        <HStack gap={4} align="start" justify="between">
          <VStack gap={1.5}>
            <HStack gap={3} align="center" wrap="wrap">
              <Link href="#/board" type="supporting" color="secondary">
                <HStack as="span" gap={1} align="center">
                  <Icon icon={ArrowLeft} size="sm" />
                  ai-leash board
                </HStack>
              </Link>
              <Divider orientation="vertical" xstyle={styles.rule} />
              <Text type="supporting" color="secondary">
                #42
              </Text>
              <Divider orientation="vertical" xstyle={styles.rule} />
              <Text type="supporting" color="secondary">
                Astryx migration
              </Text>
            </HStack>
            <Heading level={2} maxLines={2}>
              Astryx: board on the kanban template
            </Heading>
          </VStack>
          <HStack gap={1}>
            <IconButton variant="ghost" label="Edit" tooltip="Edit" icon={<Icon icon={Pencil} size="sm" />} />
            <Button variant="secondary" label="Open its chat" icon={<Icon icon={ArrowUpRight} size="sm" />} />
            <MoreMenu label="Task actions" items={[{ label: "Stop its chat" }, { label: "Copy branch name" }, { type: "divider" }, { label: "Delete task", variant: "destructive" }]} />
          </HStack>
        </HStack>
        <HStack gap={1} align="center" wrap="wrap">
          <Selector label="Status" isLabelHidden size="sm" value="in_progress" onChange={() => {}} options={COLUMNS.map((c) => ({ value: c.id, label: c.title, icon: <StatusDot variant={c.dot} label={c.title} /> }))} />
          <Selector label="Priority" isLabelHidden size="sm" value="high" onChange={() => {}} options={Object.entries(PRIORITY_META).map(([v, m]) => ({ value: v, label: m.label }))} />
          <Selector label="Effort" isLabelHidden size="sm" value="L" onChange={() => {}} options={["XS", "S", "M", "L", "XL"].map((v) => ({ value: v, label: `Effort ${v}` }))} />
          <Selector label="Epic" isLabelHidden size="sm" value="Astryx migration" onChange={() => {}} options={EPICS.map((e) => ({ value: e.name, label: e.name }))} />
        </HStack>
      </VStack>
    </LayoutHeader>
  );
}

function ChatSection() {
  return (
    <Section padding={4}>
      <VStack gap={3}>
        <HStack align="center" justify="between">
          <Heading level={3}>Its chat</Heading>
          <HStack gap={1}>
            <Button variant="ghost" size="sm" label="Stop" icon={<Icon icon={Square} size="xsm" />} />
            <Button variant="secondary" size="sm" label="Open its chat" icon={<Icon icon={ArrowUpRight} size="xsm" />} />
          </HStack>
        </HStack>
        <Card variant="muted" padding={3}>
          <VStack gap={2}>
            <HStack align="center" gap={2}>
              <Spinner size="sm" aria-label="Working" />
              <Text weight="medium">Working for 3:12</Text>
              <Text type="supporting" color="secondary">
                edit src/features/board/BoardView.tsx · 2 sub-agents running
              </Text>
            </HStack>
            <Text color="secondary">
              Last reply: “The board now renders on the template's frame: a LayoutHeader toolbar, one muted Card per column with a status dot and count…”
            </Text>
          </VStack>
        </Card>
      </VStack>
    </Section>
  );
}

function ActivitySection() {
  return (
    <Section padding={4}>
      <VStack gap={3}>
        <Heading level={3}>Activity</Heading>
        <VStack gap={2}>
          {ACTIVITY.map((a) => (
            <HStack key={a.what} gap={2} align="start">
              <Icon icon={a.icon} size="sm" color="secondary" />
              <HStack gap={1.5} align="center" xstyle={styles.grow} wrap="wrap">
                <Text weight="semibold">{a.who}</Text>
                <Text color="secondary">{a.what}</Text>
              </HStack>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {a.when}
              </Text>
            </HStack>
          ))}
        </VStack>
      </VStack>
    </Section>
  );
}

function DetailsRail() {
  return (
    <VStack gap={6}>
      <VStack gap={3}>
        <Heading level={4}>Details</Heading>
        <MetadataList>
          <MetadataListItem label="Created">
            <Text>Today, 09:31</Text>
          </MetadataListItem>
        </MetadataList>
      </VStack>
      <VStack gap={3}>
        <Heading level={4}>Agent</Heading>
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
      <VStack gap={3}>
        <Heading level={4}>Checkout</Heading>
        <MetadataList>
          <MetadataListItem label="Worktree">
            <Text type="code">task-42</Text>
          </MetadataListItem>
          <MetadataListItem label="Branch">
            <Text type="code">task/42-astryx-board</Text>
          </MetadataListItem>
          <MetadataListItem label="Project chat">
            <Text>Following</Text>
          </MetadataListItem>
        </MetadataList>
      </VStack>
    </VStack>
  );
}

/** The task view, on the work-item-detail template. */
export default function TaskScreen() {
  return (
    <AppFrame project="ai-leash" title="#42 Astryx: board on the kanban template" boardLayout="board" selectedBoard="ai-leash">
      <Layout
        height="fill"
        header={<PageHeader />}
        content={
          <LayoutContent padding={2} role="main">
            <VStack gap={2}>
              <Section padding={4}>
                <VStack gap={3}>
                  <Heading level={3}>Description</Heading>
                  <Markdown density="compact">{DESCRIPTION}</Markdown>
                </VStack>
              </Section>
              <Divider />
              <ChatSection />
              <Divider />
              <ActivitySection />
            </VStack>
          </LayoutContent>
        }
        end={
          <LayoutPanel width={300} padding={4} role="complementary" hasDivider>
            <DetailsRail />
          </LayoutPanel>
        }
      />
    </AppFrame>
  );
}
