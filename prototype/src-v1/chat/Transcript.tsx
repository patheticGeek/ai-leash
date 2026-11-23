import { Button } from "@astryxdesign/core/Button";
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageMetadata,
  ChatToolCalls,
  type ChatToolCallItem,
} from "@astryxdesign/core/Chat";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import {
  ArrowUpRight,
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  Inbox,
  RotateCcw,
  ScrollText,
} from "lucide-react";
import type { ReactNode } from "react";

const styles = stylex.create({
  row: {
    minHeight: spacingVars["--spacing-6"],
    paddingInlineEnd: spacingVars["--spacing-1"],
  },
  grow: { minWidth: 0, flex: 1 },
  label: { flexShrink: 0 },
  italic: { fontStyle: "italic" },
  // The thin rule our expanded rows hang their detail beside.
  detail: {
    marginInlineStart: spacingVars["--spacing-1-5"],
    paddingInlineStart: spacingVars["--spacing-4"],
    borderInlineStartWidth: `calc(2 * ${borderVars["--border-width"]})`,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: colorVars["--color-border"],
  },
  // A message from another chat: the bubble gets an accent ring.
  fromRing: {
    boxShadow: `0 0 0 1px ${colorVars["--color-accent"]}`,
    borderRadius: radiusVars["--radius-container"],
  },
  thread: {
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-muted"],
  },
});

/**
 * Our expandable transcript row (thinking, notes, Worked for, system
 * context), drawn to match ChatToolCalls' row: same height, chevron, icon,
 * label then a dim one-line summary. Grouping stays ours.
 */
export function ActivityRow({
  icon,
  label,
  summary,
  isExpanded = false,
  isItalic = false,
  trailing,
  children,
}: {
  icon?: ReactNode;
  label: string;
  summary?: string;
  isExpanded?: boolean;
  isItalic?: boolean;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <VStack gap={1}>
      <HStack align="center" gap={1.5} xstyle={styles.row}>
        <Icon icon={isExpanded ? ChevronDown : ChevronRight} size="xsm" color="secondary" />
        {icon}
        <Text color="secondary" maxLines={1} xstyle={[styles.label, isItalic && styles.italic]}>
          {label}
        </Text>
        {summary && !isExpanded && (
          <Text color="disabled" maxLines={1} xstyle={styles.grow}>
            {summary}
          </Text>
        )}
        {trailing}
      </HStack>
      {isExpanded && children && (
        <VStack gap={2} xstyle={styles.detail}>
          {children}
        </VStack>
      )}
    </VStack>
  );
}

/** One tool call: ChatToolCalls' row (status icon, mono name, target, diff, duration). */
export function ToolRow(props: ChatToolCallItem & { isExpanded?: boolean }) {
  const { isExpanded, ...call } = props;
  return <ChatToolCalls calls={[call]} defaultIsExpanded={isExpanded} />;
}

/** Our ActivityGroup: a run of thinking/tool steps, showing the latest one. */
export function ActivityGroup({
  summary,
  isExpanded = false,
  children,
}: {
  summary: string;
  isExpanded?: boolean;
  children: ReactNode;
}) {
  return (
    <VStack gap={0.5}>
      {children}
      <HStack>
        <Button
          variant="ghost"
          size="sm"
          label={isExpanded ? "Hide" : `Show all (${summary})`}
          icon={<Icon icon={ChevronDown} size="xsm" />}
        />
      </HStack>
    </VStack>
  );
}

/** A spawned sub-agent thread, nested under its spawn_sub_agent call. */
export function SubAgentThread({
  description,
  model,
  state,
  duration,
  lastStep,
}: {
  description: string;
  model: string;
  state: "running" | "done" | "error";
  duration: string;
  lastStep: string;
}) {
  return (
    <HStack align="center" gap={2} padding={2} xstyle={styles.thread}>
      {state === "running" ? (
        <Spinner size="sm" aria-label="Running" />
      ) : (
        <StatusDot variant={state === "done" ? "success" : "error"} label={state} />
      )}
      <VStack gap={0} xstyle={styles.grow}>
        <Text weight="medium" maxLines={1}>
          {description}
        </Text>
        <Text type="supporting" color="secondary" maxLines={1}>
          {model} · {lastStep}
        </Text>
      </VStack>
      <Text type="supporting" color="secondary" hasTabularNumbers>
        {duration}
      </Text>
      <IconButton variant="ghost" size="sm" label="Open in a tab" tooltip="Open in a tab" icon={<Icon icon={ArrowUpRight} size="sm" />} />
    </HStack>
  );
}

export function SubAgentSpawn({ children }: { children: ReactNode }) {
  return (
    <VStack gap={1}>
      <HStack align="center" gap={1.5} xstyle={styles.row}>
        <Icon icon={ChevronDown} size="xsm" color="secondary" />
        <Icon icon={Bot} size="sm" color="secondary" />
        <Text type="code">spawn_sub_agent</Text>
        <Text color="disabled">2 threads</Text>
      </HStack>
      <VStack gap={1} xstyle={styles.detail}>
        {children}
      </VStack>
    </VStack>
  );
}

export function ThinkingRow({ seconds, text, isExpanded }: { seconds: number; text?: string; isExpanded?: boolean }) {
  return (
    <ActivityRow label={`Thought for ${seconds}s`} isItalic isExpanded={isExpanded} summary={text}>
      {text && (
        <Text color="secondary" xstyle={styles.italic}>
          {text}
        </Text>
      )}
    </ActivityRow>
  );
}

export function NoteRow({ from, first }: { from: string; first: string }) {
  return (
    <ActivityRow
      icon={<Icon icon={Inbox} size="sm" color="secondary" />}
      label={`Note from ${from}`}
      summary={first}
    />
  );
}

export function SystemContextRow() {
  return (
    <ActivityRow
      icon={<Icon icon={ScrollText} size="sm" color="secondary" />}
      label="System context"
      summary="AGENTS.md · docs/AGENTS.md · project memory · 3 skills · 4 actions"
    />
  );
}

export function WorkedFor({ time, summary }: { time: string; summary: string }) {
  return <ActivityRow label={`Worked for ${time}`} summary={summary} />;
}

export function UserMessage({
  children,
  time,
  from,
}: {
  children: string;
  time: string;
  from?: string;
}) {
  return (
    <ChatMessage sender="user">
      {from && (
        <HStack hAlign="end">
          <Button variant="ghost" size="sm" label={`From ${from}`} icon={<Icon icon={ArrowUpRight} size="xsm" />} />
        </HStack>
      )}
      <ChatMessageBubble
        xstyle={from ? styles.fromRing : undefined}
        metadata={<ChatMessageMetadata timestamp={time} footer={<CopyButton />} />}
      >
        <Markdown density="compact">{children}</Markdown>
      </ChatMessageBubble>
    </ChatMessage>
  );
}

function CopyButton() {
  return <IconButton variant="ghost" size="sm" label="Copy" icon={<Icon icon={Copy} size="xsm" />} />;
}

export function AssistantText({ children }: { children: string }) {
  return (
    <ChatMessageBubble variant="ghost">
      <Markdown density="compact">{children}</Markdown>
    </ChatMessageBubble>
  );
}

export function AssistantFooter({ time, worked, canRetry }: { time: string; worked?: string; canRetry?: boolean }) {
  return (
    <ChatMessageMetadata
      timestamp={time}
      footer={
        <HStack align="center" gap={0.5}>
          {worked && (
            <Text type="supporting" color="secondary">
              Worked for {worked}
            </Text>
          )}
          <CopyButton />
          {canRetry && <IconButton variant="ghost" size="sm" label="Retry" icon={<Icon icon={RotateCcw} size="xsm" />} />}
        </HStack>
      }
    />
  );
}

export function WorkingFor({ time }: { time: string }) {
  return (
    <HStack align="center" gap={2}>
      <Spinner size="sm" aria-label="Working" />
      <Text color="secondary" hasTabularNumbers>
        Working for {time}
      </Text>
    </HStack>
  );
}

export function Diff({ code }: { code: string }) {
  return <CodeBlock code={code} language="typescript" isDiff size="sm" width="100%" hasLanguageLabel={false} />;
}
