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
} from "@astryxdesign/core/Chat";
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
  CpuChipIcon,
  LightBulbIcon,
  PaperClipIcon,
  QueueListIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { BranchIcon, WorktreeIcon } from "./icons";

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

export function RateLimitNotice() {
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

export function TaskLinkNotice() {
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
      input={<ChatComposerInput />}
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
