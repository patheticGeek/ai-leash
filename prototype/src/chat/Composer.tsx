// The composer dock: the ai-chat template's ChatComposer, with ai leash's
// controls in the slots ChatComposer names for them —
//   headerActions  attach
//   headerContext  context-window usage ("context window usage, ProgressBar,
//                  supporting text" is the slot's documented use)
//   footerActions  model, effort and permission pickers
//   sendActions    Queue (while a turn runs), beside Send / Stop
//   drawer         queued messages (ChatComposerDrawer of removable Tokens)
// Notices that need actions (rate limit, task link) are Banners above the
// box; the worktree/branch bar sits below it. A permission or elicitation
// prompt takes the box's place, on the same card surface.
import { useState, type ReactNode } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  type ChatComposerTrigger,
} from "@astryxdesign/core/Chat";
import { createStaticSource, TypeaheadItem, type SearchableItem } from "@astryxdesign/core/Typeahead";
import { List, ListItem } from "@astryxdesign/core/List";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { IconButton } from "@astryxdesign/core/IconButton";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text, Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CpuChipIcon,
  DocumentIcon,
  FolderIcon,
  StopIcon,
  LightBulbIcon,
  PaperClipIcon,
  QueueListIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { BranchIcon, WorktreeIcon } from "./icons";

// Input triggers, the ChatComposerInputMentionTrigger block's pattern: a
// character opens a Typeahead menu above the input; picking an item inserts a
// token. "/" = slash commands (local + the agent's), "@" = file mention
// (planned).
const COMMANDS: SearchableItem<{ description: string }>[] = [
  { id: "clear", label: "clear", auxiliaryData: { description: "Delete this conversation's transcript and start fresh" } },
  { id: "model", label: "model", auxiliaryData: { description: "Open the model and agent picker" } },
  { id: "help", label: "help", auxiliaryData: { description: "Show local commands and the agent's commands" } },
  { id: "review", label: "review", auxiliaryData: { description: "Claude Code · Review the current diff" } },
  { id: "init", label: "init", auxiliaryData: { description: "Claude Code · Write an AGENTS.md for this project" } },
];

export const commandTrigger: ChatComposerTrigger = {
  character: "/",
  searchSource: createStaticSource(COMMANDS),
  renderItem: (item) => (
    <TypeaheadItem item={item} description={(item.auxiliaryData as { description: string })?.description} />
  ),
  onSelect: (item) => ({ value: `/${item.label}`, label: `/${item.label}`, variant: "yellow" }),
};

const FILES: SearchableItem<{ dir: string; isDir?: boolean }>[] = [
  { id: "f1", label: "BoardView.tsx", auxiliaryData: { dir: "src/features/board" } },
  { id: "f2", label: "boardLayout.ts", auxiliaryData: { dir: "src/features/board" } },
  { id: "f3", label: "board", auxiliaryData: { dir: "src/features", isDir: true } },
  { id: "f4", label: "project-board.md", auxiliaryData: { dir: "docs/features" } },
  { id: "f5", label: "BoardSettingsDialog.tsx", auxiliaryData: { dir: "src/features/board" } },
];

export const fileTrigger: ChatComposerTrigger = {
  character: "@",
  searchSource: createStaticSource(FILES),
  renderItem: (item) => {
    const d = item.auxiliaryData as { dir: string; isDir?: boolean };
    return (
      <TypeaheadItem
        item={item}
        description={d.dir}
        icon={<Icon icon={d.isDir ? FolderIcon : DocumentIcon} size="sm" color="secondary" />}
      />
    );
  },
  onSelect: (item) => ({ value: `@${(item.auxiliaryData as { dir: string }).dir}/${item.label}`, label: item.label, variant: "blue" }),
};

export function ComposerPickers({ isCompact }: { isCompact?: boolean }) {
  const model = isCompact ? "Opus 5.5" : "Claude Code · Opus 5.5";
  return (
    <>
      <DropdownMenu
        button={{ label: model, variant: "ghost", size: "sm", icon: <Icon icon={CpuChipIcon} size="sm" />, children: model }}
        menuWidth={260}
        items={[
          { type: "section", title: "Claude Code", items: [{ label: "Opus 5.5" }, { label: "Sonnet 5.5" }, { label: "Haiku 5.5" }] },
          { type: "divider" },
          { type: "section", title: "GitHub Copilot", items: [{ label: "GPT-5.2" }] },
          { type: "section", title: "Local Ollama", items: [{ label: "qwen3-coder:30b" }] },
        ]}
      />
      <DropdownMenu
        button={{ label: "Effort: High", variant: "ghost", size: "sm", icon: <Icon icon={LightBulbIcon} size="sm" />, isIconOnly: isCompact, children: isCompact ? undefined : "High" }}
        items={[{ label: "Low" }, { label: "Medium" }, { label: "High" }, { label: "Max" }]}
      />
      <DropdownMenu
        button={{ label: "Permissions: Accept edits", variant: "ghost", size: "sm", icon: <Icon icon={ShieldCheckIcon} size="sm" />, isIconOnly: isCompact, children: isCompact ? undefined : "Accept edits" }}
        items={[{ label: "Ask every time" }, { label: "Accept edits" }, { label: "Plan only" }, { label: "Bypass permissions" }]}
      />
    </>
  );
}

function AttachButton() {
  return (
    <Button
      label="Attach"
      variant="ghost"
      size="sm"
      icon={<Icon icon={PaperClipIcon} size="sm" />}
      isIconOnly
    />
  );
}

export function CheckoutBar({ worktree, branch }: { worktree: string; branch: string }) {
  return (
    <HStack hAlign="between" vAlign="center" paddingInline={1}>
      <Selector
        label="Worktree"
        isLabelHidden
        variant="ghost"
        size="sm"
        startIcon={WorktreeIcon}
        value={worktree}
        onChange={() => {}}
        options={[...[...new Set([worktree, "primary", "task-38"])], { type: "divider" }, { value: "new", label: "New worktree…" }]}
      />
      <Selector
        label="Branch"
        isLabelHidden
        variant="ghost"
        size="sm"
        startIcon={BranchIcon}
        value={branch}
        onChange={() => {}}
        options={[...[...new Set([branch, "astryx-migration", "master"])], { type: "divider" }, { value: "new", label: "New branch…" }]}
      />
    </HStack>
  );
}

export function RateLimitNotice({ isCountingDown }: { isCountingDown?: boolean }) {
  if (isCountingDown) {
    return (
      <Banner
        status="warning"
        collapsible={false}
        title="Claude session limit reached · resuming in 1:42:07"
        description="Resets at 14:00. This turn picks up automatically then."
        endContent={
          <HStack gap={1}>
            <Button label="Don't resume" variant="ghost" size="sm" />
            <Button label="Try now" size="sm" />
          </HStack>
        }
      />
    );
  }
  return (
    <Banner
      status="warning"
      collapsible={false}
      title="Claude session limit reached"
      description="Resets at 14:00. Resume this turn automatically then?"
      endContent={
        <HStack gap={1}>
          <Button label="No" variant="ghost" size="sm" />
          <Button label="Yes, resume automatically" size="sm" />
        </HStack>
      }
    />
  );
}

export function TaskLinkNotice({ isUnfollowed }: { isUnfollowed?: boolean }) {
  if (isUnfollowed) {
    return (
      <Banner
        status="info"
        collapsible={false}
        title="The project chat isn't following this task"
        description="Hand it back so the project chat picks up this task's worktree and replies."
        endContent={<Button label="Hand back to project chat" size="sm" />}
      />
    );
  }
  return (
    <Banner
      status="info"
      collapsible={false}
      title="Following task #38"
      description="The project chat is linked to this task's worktree until you hand it back."
      endContent={<Button label="Hand back to project chat" size="sm" />}
    />
  );
}

export function AgentErrorNotice({ kind }: { kind: "crash" | "connection" }) {
  if (kind === "connection") {
    return (
      <Banner
        status="error"
        collapsible={false}
        title="Lost the connection to Local Ollama · retrying in 5s"
        description="http://localhost:11434 refused the connection. Your message is kept and is sent when it's back."
        endContent={<Button label="Retry now" size="sm" icon={<Icon icon={ArrowPathIcon} size="sm" />} />}
      />
    );
  }
  return (
    <Banner
      status="error"
      collapsible={false}
      title="Claude Code stopped unexpectedly"
      description="The agent process exited with code 1 during this turn. Restarting resumes the same session."
      endContent={
        <HStack gap={1}>
          <Button label="Show log" variant="ghost" size="sm" />
          <Button label="Restart agent" size="sm" icon={<Icon icon={ArrowPathIcon} size="sm" />} />
        </HStack>
      }
    />
  );
}

// Conversation notices (the real app's TranscriptNotices, today sticky at the
// top of the transcript). Here they join the composer's Banner stack: one
// place for every notice, next to the send they affect, and nothing overlays
// the transcript while it scrolls. Same Banner, same status rules as the
// other strips.
export function ChatErrorNotice() {
  return (
    <Banner
      status="error"
      collapsible={false}
      isDismissable
      dismissLabel="Dismiss"
      title="Error"
      description="OpenRouter returned HTTP 429: Rate limit exceeded for anthropic/claude-sonnet-5-5. Try again in 20s."
    />
  );
}

export function RestoreFailedNotice() {
  return (
    <Banner
      status="error"
      collapsible={false}
      title="Couldn't restore the previous session"
      description="session/load failed: session 9c41e2 not found. This agent no longer remembers this conversation."
      endContent={<Button label="Start new session" size="sm" />}
    />
  );
}

export function HistoryTruncatedNotice() {
  return (
    <Banner
      status="warning"
      collapsible={false}
      isDismissable
      dismissLabel="Dismiss"
      title="Earlier history not shared"
      description="Claude Code doesn't support resuming a previous session, so this conversation's earlier history won't be visible to it."
    />
  );
}

// /help: the commands this chat accepts, docked above the composer. An info
// Banner whose body is the compact List the side panel uses; dismiss = close.
const HELP_COMMANDS = [
  { name: "!command", description: "Run a shell command directly: no permission prompt, the result is shown as a tool call" },
  { name: "/clear", description: "Delete this conversation's transcript and start fresh" },
  { name: "/model", description: "Open the model and agent picker" },
  { name: "/help", description: "Show local commands and the agent's commands" },
  { name: "/review", description: "Claude Code · Review the current diff" },
  { name: "/init", description: "Claude Code · Write an AGENTS.md for this project" },
  { name: "/compact [instructions]", description: "Claude Code · Summarise the conversation to free up context" },
];

export function HelpPanel() {
  return (
    <Banner
      status="info"
      collapsible={false}
      isDismissable
      dismissLabel="Close help"
      title="Commands"
      description="Type / or ! at the start of a message."
    >
      <List density="compact" edge="flush">
        {HELP_COMMANDS.map((c) => (
          <ListItem key={c.name} label={c.name} description={c.description} />
        ))}
      </List>
    </Banner>
  );
}

// Planned: running sub-agents, docked above the composer. Collapsed it's one
// quiet line (Spinner + count + toggle); expanded, the same compact List the
// side panel's Sub agents tab uses, on a muted Card.
const PILL_AGENTS = [
  { id: "a", label: "Check drag between epic rows against dnd-kit", detail: "claude-sonnet-5-5 · grep -rn onDragEnd", elapsed: "1:04" },
  { id: "b", label: "List every place that reads task.epic", detail: "claude-haiku-5-5 · read src/store/boardSlice.ts", elapsed: "0:38" },
  { id: "c", label: "Find the board's scroll container", detail: "claude-haiku-5-5 · read src/features/board/BoardView.tsx", elapsed: "0:12" },
];

export function SubAgentsPill({ isOpen: initialOpen = false }: { isOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const toggle = (
    <Button
      label={isOpen ? "Hide sub-agents" : "Show sub-agents"}
      variant="ghost"
      size="sm"
      icon={<Spinner size="sm" aria-label="Running" />}
      endContent={<Icon icon={isOpen ? ChevronDownIcon : ChevronUpIcon} size="sm" />}
      onClick={() => setIsOpen((v) => !v)}
    >
      3 sub-agents running
    </Button>
  );
  if (!isOpen) return <HStack hAlign="start">{toggle}</HStack>;
  return (
    <Card variant="muted" padding={0}>
      <VStack gap={0}>
        <HStack hAlign="between" vAlign="center" paddingInline={1} paddingBlock={1}>
          {toggle}
          <Button label="Stop all" variant="ghost" size="sm" icon={<Icon icon={StopIcon} size="sm" />} />
        </HStack>
        <List density="compact" edge="padded">
          {PILL_AGENTS.map((a) => (
            <ListItem
              key={a.id}
              label={a.label}
              description={a.detail}
              startContent={<StatusDot variant="accent" isPulsing label="Running" />}
              endContent={
                <HStack gap={1} vAlign="center">
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {a.elapsed}
                  </Text>
                  <IconButton variant="ghost" size="sm" label="Stop sub-agent" icon={<Icon icon={StopIcon} size="sm" />} />
                </HStack>
              }
            />
          ))}
        </List>
      </VStack>
    </Card>
  );
}

export function MessageComposer({
  isWorking,
  queued = [],
  placeholder = "Ask the agent, / for commands, ! for shell",
  isCompact,
}: {
  isCompact?: boolean;
  isWorking?: boolean;
  queued?: string[];
  placeholder?: string;
}) {
  const [items, setItems] = useState(queued);
  return (
    <ChatComposer
      onSubmit={() => {}}
      onStop={() => {}}
      isStopShown={isWorking}
      placeholder={placeholder}
      input={<ChatComposerInput triggers={[commandTrigger, fileTrigger]} />}
      drawer={
        items.length > 0 ? (
          <ChatComposerDrawer label="Queued" count={items.length}>
            {items.map((q) => (
              <Token
                key={q}
                label={q}
                icon={<Icon icon={QueueListIcon} size="sm" />}
                onRemove={() => setItems((prev) => prev.filter((x) => x !== q))}
              />
            ))}
          </ChatComposerDrawer>
        ) : undefined
      }
      headerActions={<AttachButton />}
      headerContext={
        <Text type="supporting" color="secondary" hasTabularNumbers>
          62% of context
        </Text>
      }
      density={isCompact ? "compact" : "balanced"}
      footerActions={<ComposerPickers isCompact={isCompact} />}
      sendActions={isWorking ? <Button label="Queue" variant="ghost" size="sm" /> : undefined}
    />
  );
}

/** A prompt that takes the composer's place, on the composer's card surface. */
function PromptCard({ title, subtitle, children, actions }: { title: string; subtitle: string; children: ReactNode; actions: ReactNode }) {
  return (
    <Card elevation="low" padding={4}>
      <VStack gap={3}>
        <VStack gap={0.5}>
          <Heading level={4}>{title}</Heading>
          <Text type="supporting" color="secondary">
            {subtitle}
          </Text>
        </VStack>
        {children}
        <HStack gap={2} vAlign="center" hAlign="end">
          {actions}
        </HStack>
      </VStack>
    </Card>
  );
}

export function PermissionPrompt() {
  return (
    <PromptCard
      title="Run this command?"
      subtitle="Bash · the agent wants to run a command outside the accepted edits"
      actions={
        <>
          <Button label="Always allow npm test" variant="ghost" size="sm" />
          <Button label="Deny" size="sm" />
          <Button label="Approve" variant="primary" size="sm" />
        </>
      }
    >
      <CodeBlock code="npm test -- src/features/board" language="bash" width="100%" size="sm" hasLanguageLabel={false} />
    </PromptCard>
  );
}

export function ElicitationPrompt() {
  const [choice, setChoice] = useState("lane");
  const [note, setNote] = useState("");
  return (
    <PromptCard
      title="Where should a card dropped on a lane label go?"
      subtitle="Question 1 of 2 · from the agent"
      actions={
        <>
          <Button label="Decline" variant="ghost" size="sm" />
          <Button label="Skip" size="sm" />
          <Button label="Next" variant="primary" size="sm" />
        </>
      }
    >
      <RadioList label="Answer" isLabelHidden value={choice} onChange={setChoice}>
        <RadioListItem value="lane" label="Top of that epic's first column" description="Keeps its status, changes its epic" />
        <RadioListItem value="same" label="Same column, that epic's lane" description="Keeps its status and position" />
        <RadioListItem value="reject" label="Don't accept drops on the label" />
      </RadioList>
      <TextInput label="Add a note" isLabelHidden placeholder="Add a note (optional)" value={note} onChange={setNote} />
    </PromptCard>
  );
}

export function ComposerDock({
  top,
  box,
  checkout,
}: {
  top?: ReactNode;
  box: ReactNode;
  checkout?: { worktree: string; branch: string };
}) {
  return (
    <VStack gap={2}>
      {top}
      {box}
      {checkout && <CheckoutBar {...checkout} />}
    </VStack>
  );
}
