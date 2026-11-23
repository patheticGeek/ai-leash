import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
} from "@astryxdesign/core/Chat";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import { Kbd } from "@astryxdesign/core/Kbd";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import {
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import {
  Bot,
  Brain,
  ChevronDown,
  Clock,
  FolderGit2,
  GitBranch,
  ListPlus,
  Paperclip,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

const styles = stylex.create({
  // Same docking as the app's DockedBanner: inset from the box, square on
  // the edge that meets it.
  strip: {
    marginInline: spacingVars["--spacing-10"],
    paddingBlock: spacingVars["--spacing-1-5"],
    paddingInline: spacingVars["--spacing-3"],
    borderStartStartRadius: radiusVars["--radius-element"],
    borderStartEndRadius: radiusVars["--radius-element"],
  },
  stripBottom: {
    marginInline: spacingVars["--spacing-10"],
    paddingBlock: spacingVars["--spacing-0-5"],
    paddingInline: spacingVars["--spacing-1"],
    borderEndStartRadius: radiusVars["--radius-element"],
    borderEndEndRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-muted"],
  },
  neutral: { backgroundColor: colorVars["--color-background-muted"], color: colorVars["--color-text-secondary"] },
  info: {
    backgroundColor: `color-mix(in srgb, ${colorVars["--color-info-muted"]} 45%, ${colorVars["--color-background-body"]})`,
    color: colorVars["--color-text-info"],
  },
  warning: {
    backgroundColor: `color-mix(in srgb, ${colorVars["--color-warning-muted"]} 45%, ${colorVars["--color-background-body"]})`,
    color: colorVars["--color-text-warning"],
  },
  grow: { minWidth: 0, flex: 1 },
  noShrink: { flexShrink: 0 },
  input: { minHeight: 44 },
  prompt: { marginBlockStart: spacingVars["--spacing-1"] },
});

export function Strip({
  tone = "neutral",
  title,
  description,
  end,
  children,
}: {
  tone?: "neutral" | "info" | "warning";
  title?: string;
  description?: string;
  end?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <VStack gap={1} xstyle={[styles.strip, styles[tone]]}>
      {title && (
        <HStack align="center" justify="between" gap={3}>
          <HStack align="center" gap={2} xstyle={styles.grow}>
            <Text type="inherit" color="inherit" weight="medium" maxLines={1} xstyle={styles.noShrink}>
              {title}
            </Text>
            {description && (
              <Text type="inherit" color="secondary" maxLines={1}>
                {description}
              </Text>
            )}
          </HStack>
          {end}
        </HStack>
      )}
      {children}
    </VStack>
  );
}

export function QueuedStrip({ messages }: { messages: string[] }) {
  return (
    <Strip tone="neutral">
      {messages.map((m) => (
        <HStack key={m} align="center" justify="between" gap={3}>
          <HStack align="center" gap={2} xstyle={styles.grow}>
            <Icon icon={Clock} size="xsm" color="secondary" />
            <Text type="inherit" color="inherit" maxLines={1}>
              Queued: {m}
            </Text>
          </HStack>
          <IconButton variant="ghost" size="sm" label="Cancel queued message" icon={<Icon icon={X} size="xsm" />} />
        </HStack>
      ))}
    </Strip>
  );
}

export function CheckoutBar({ worktree, branch, isLocked }: { worktree: string; branch: string; isLocked?: boolean }) {
  return (
    <HStack align="center" justify="between" xstyle={styles.stripBottom}>
      <Button
        variant="ghost"
        size="sm"
        label={worktree}
        isDisabled={isLocked}
        icon={<Icon icon={FolderGit2} size="xsm" />}
        endContent={<Icon icon={ChevronDown} size="xsm" />}
      />
      <Button variant="ghost" size="sm" label={branch} icon={<Icon icon={GitBranch} size="xsm" />} endContent={<Icon icon={ChevronDown} size="xsm" />} />
    </HStack>
  );
}

/** The pickers along the composer footer: model/agent, effort, permission. */
export function ComposerPickers({ agent, effort, mode }: { agent: string; effort?: string; mode: string }) {
  return (
    <HStack align="center" gap={1}>
      <Button variant="ghost" size="sm" label={agent} icon={<Icon icon={Bot} size="sm" />} endContent={<Icon icon={ChevronDown} size="xsm" />} />
      {effort && (
        <Button variant="ghost" size="sm" label={effort} icon={<Icon icon={Brain} size="sm" />} endContent={<Icon icon={ChevronDown} size="xsm" />} />
      )}
      <Button variant="ghost" size="sm" label={mode} icon={<Icon icon={ShieldCheck} size="sm" />} endContent={<Icon icon={ChevronDown} size="xsm" />} />
    </HStack>
  );
}

export function ContextUsage({ percent }: { percent: number }) {
  return (
    <Text type="supporting" color="secondary" hasTabularNumbers>
      {percent}% of context
    </Text>
  );
}

/** The composer: Astryx ChatComposer with our slots. */
export function Composer({
  placeholder = "Ask the agent, / for commands, ! for shell",
  agent,
  effort,
  mode,
  isSending = false,
  attachments,
  contextPercent,
  value,
}: {
  placeholder?: string;
  agent: string;
  effort?: string;
  mode: string;
  isSending?: boolean;
  attachments?: string[];
  contextPercent?: number;
  value?: string;
}) {
  return (
    <ChatComposer
      onSubmit={() => {}}
      isStopShown={isSending}
      placeholder={placeholder}
      value={value}
      input={<ChatComposerInput xstyle={styles.input} />}
      drawer={
        attachments && attachments.length > 0 ? (
          <ChatComposerDrawer count={attachments.length}>
            {attachments.map((a) => (
              <Token key={a} label={a} onRemove={() => {}} />
            ))}
          </ChatComposerDrawer>
        ) : undefined
      }
      footerActions={
        <HStack align="center" gap={1}>
          <IconButton variant="ghost" size="sm" label="Attach files" tooltip="Attach files" icon={<Icon icon={Paperclip} size="sm" />} />
          <ComposerPickers agent={agent} effort={effort} mode={mode} />
        </HStack>
      }
      sendActions={
        <HStack align="center" gap={1}>
          {contextPercent != null && <ContextUsage percent={contextPercent} />}
          {isSending && (
            <Button variant="ghost" size="sm" label="Queue" icon={<Icon icon={ListPlus} size="sm" />} tooltip="Queue (Ctrl+Enter)" />
          )}
        </HStack>
      }
    />
  );
}

/** The permission ask that replaces the message box while it waits. */
export function PermissionPrompt() {
  return (
    <Card variant="default" padding={3} elevation="low">
      <VStack gap={3}>
        <HStack align="center" justify="between" gap={2}>
          <VStack gap={0}>
            <Text weight="semibold">Run shell command</Text>
            <Text type="supporting" color="secondary">
              Claude Code wants to run this in task-38 (task/38-settings-split)
            </Text>
          </VStack>
          <Token size="sm" color="orange" label="shell" />
        </HStack>
        <CodeBlock code={"npm run lint:fix && npx tsc --noEmit"} language="bash" width="100%" size="sm" hasLanguageLabel={false} />
        <HStack align="center" justify="between">
          <Text type="supporting" color="secondary">
            Ask mode — every edit and command waits for you
          </Text>
          <HStack gap={1}>
            <Button variant="secondary" label="Deny" />
            <Button variant="primary" label="Approve" endContent={<Kbd keys="enter" />} />
          </HStack>
        </HStack>
      </VStack>
    </Card>
  );
}

/** An agent's structured question, one page at a time. */
export function ElicitationPrompt() {
  return (
    <Card variant="default" padding={3} elevation="low">
      <VStack gap={3}>
        <HStack align="center" justify="between">
          <Text weight="semibold">Claude Code is asking · 1 of 2</Text>
          <IconButton variant="ghost" size="sm" label="Dismiss" icon={<Icon icon={X} size="sm" />} />
        </HStack>
        <Text>Where should the resize throttling live?</Text>
        <RadioList label="Where should the resize throttling live?" isLabelHidden value="pty" onChange={() => {}}>
          <RadioListItem value="pty" label="In pty.rs" description="Coalesce resize events on the Rust side, one ioctl per frame" />
          <RadioListItem value="xterm" label="In TerminalPanel.tsx" description="Debounce fit() in the ResizeObserver callback" />
          <RadioListItem value="both" label="Both" description="Debounce in the UI and coalesce in Rust" />
        </RadioList>
        <TextInput label="Note (optional)" placeholder="Anything else the agent should know" value="" onChange={() => {}} />
        <HStack align="center" justify="between">
          <Button variant="ghost" label="Decline" />
          <HStack gap={1}>
            <Button variant="secondary" label="Skip" />
            <Button variant="primary" label="Next" />
          </HStack>
        </HStack>
      </VStack>
    </Card>
  );
}

/** The slash-command menu as it opens over the box. */
export function SlashMenu() {
  const rows = [
    { n: "/clear", d: "Delete this conversation's transcript", src: "ai leash" },
    { n: "/model", d: "Open the model and agent picker", src: "ai leash" },
    { n: "/help", d: "Show local and agent commands", src: "ai leash" },
    { n: "/compact", d: "Summarize the conversation to free context", src: "ai leash" },
    { n: "/review", d: "Review the current diff  <branch?>", src: "Claude Code" },
  ];
  return (
    <Card variant="default" padding={1} elevation="med" xstyle={styles.prompt}>
      <VStack gap={0}>
        {rows.map((r, i) => (
          <Item
            key={r.n}
            density="compact"
            isHighlighted={i === 0}
            label={<Text type="code">{r.n}</Text>}
            description={r.d}
            layout="inline"
            endContent={
              <Text type="supporting" color="secondary">
                {r.src}
              </Text>
            }
          />
        ))}
      </VStack>
    </Card>
  );
}

export function FollowToggle() {
  return <CheckboxInput label="The project chat follows it" value onChange={() => {}} />;
}

export function HandBackButton() {
  return <Button variant="secondary" size="sm" label="Hand back to project chat" icon={<Icon icon={Undo2} size="xsm" />} />;
}

export function RateLimitActions() {
  return (
    <HStack gap={1}>
      <Button variant="ghost" size="sm" label="No" />
      <Button variant="secondary" size="sm" label="Yes, resume automatically" />
    </HStack>
  );
}
