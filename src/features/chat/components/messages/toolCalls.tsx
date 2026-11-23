import type { ChatToolCallItem } from "@astryxdesign/core/Chat";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { SquareArrowOutUpRight } from "lucide-react";
import { type SubAgentTask, useSubAgents } from "@/data/subAgents";
import { formatDuration } from "@/lib/format";
import { type Entry, isToolError } from "../../../../lib/chatEntries";
import { useAppStore } from "../../../../store";
import Markdown from "../../../../ui/Markdown";
import type { PanelEntry, SubtaskThread } from "../../hooks/useChatStream";

// How a transcript's thinking and tool entries become rows of Astryx's
// `ChatToolCalls` (status icon, mono name, target, expandable detail). The
// grouping — which entries share one `ChatToolCalls` — is
// `entryGrouping.ts`'s; this only decides what one row shows.

const styles = stylex.create({
  thought: {
    color: colorVars["--color-text-secondary"],
    fontStyle: "italic",
  },
});

// "1 thought", "3 tools used" — the counts on a group's or turn's label.
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// What an `ActivityGroup` / `WorkSummary` label says it holds.
export function activitySummary(entries: PanelEntry[], indices: number[]) {
  const count = (kind: PanelEntry["kind"]) =>
    indices.filter((i) => entries[i].kind === kind).length;
  const thoughts = count("thinking");
  const tools = count("tool");
  const messages = count("text");
  return [
    thoughts > 0 && plural(thoughts, "thought", "thoughts"),
    tools > 0 && plural(tools, "tool used", "tools used"),
    messages > 0 && plural(messages, "message", "messages"),
  ]
    .filter(Boolean)
    .join(", ");
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}

// The argument most tools are "about" — a path, a command, a query — so the
// row reads `read  src/App.tsx` rather than a JSON blob. Falls back to the
// whole arguments object on one line.
const TARGET_KEYS = [
  "path",
  "file_path",
  "filePath",
  "command",
  "cmd",
  "pattern",
  "query",
  "url",
  "description",
  "name",
];

function toolTarget(args: unknown): string | undefined {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    const record = args as Record<string, unknown>;
    for (const key of TARGET_KEYS) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return firstLine(value);
    }
  }
  const json = JSON.stringify(args);
  if (!json || json === "{}" || json === "null") return undefined;
  return json;
}

const SUB_AGENT_STATUS = {
  running: { variant: "accent", label: "Running" },
  done: { variant: "success", label: "Finished" },
  error: { variant: "error", label: "Failed" },
} as const;

// The last thing a sub-agent's thread shows, as one line.
function latestLine(entries: Entry[]): string | null {
  const last = entries[entries.length - 1];
  if (!last) return null;
  if (last.kind === "tool") return last.name;
  if (last.kind === "thinking") return last.done ? "Thought" : "Thinking…";
  return firstLine(last.content);
}

// The sub-agents a `spawn_sub_agent` call started, one compact row each:
// status, what it was asked, model and latest line, and a button that opens
// its own transcript in a tab (`SubAgentChatTab`).
function SubAgentThreads({ threads }: { threads: SubtaskThread[] }) {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const openChatTab = useAppStore((s) => s.openChatTab);
  const tasks = useSubAgents(activeSessionId);
  const byId = new Map<string, SubAgentTask>(
    tasks.map((t) => [t.subSessionId, t]),
  );
  return (
    <List density="compact" edge="flush">
      {threads.map((thread) => {
        const task = byId.get(thread.subSessionId);
        const status = SUB_AGENT_STATUS[task?.status ?? "running"];
        const ranFor =
          task && task.status !== "running" && task.endedAt
            ? `ran for ${formatDuration((task.endedAt - task.startedAt) / 1000)}`
            : null;
        const description = [
          task?.model &&
            `${task.model}${task.effort ? ` (${task.effort})` : ""}`,
          ranFor,
          latestLine(thread.entries),
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <ListItem
            key={thread.subSessionId}
            label={thread.description}
            description={description || undefined}
            startContent={
              <StatusDot
                variant={status.variant}
                label={status.label}
                isPulsing={task?.status === "running" || !task}
              />
            }
            endContent={
              <IconButton
                variant="ghost"
                size="sm"
                label="Open its conversation"
                tooltip="Open its conversation"
                icon={<Icon icon={SquareArrowOutUpRight} size="sm" />}
                onClick={() =>
                  openChatTab(thread.subSessionId, thread.description)
                }
              />
            }
          />
        );
      })}
    </List>
  );
}

// A tool call's expanded detail: its input, the sub-agents it spawned, and
// its output (titled "Error" when the result is one).
function ToolDetail({
  entry,
}: {
  entry: Extract<PanelEntry, { kind: "tool" }>;
}) {
  const failed = isToolError(entry.result);
  return (
    <VStack gap={2} width="100%">
      <CodeBlock
        code={JSON.stringify(entry.args, null, 2) ?? "null"}
        language="json"
        title="Input"
        hasLanguageLabel={false}
        size="sm"
        width="100%"
        maxHeight={240}
        isWrapped
      />
      {entry.subtasks && entry.subtasks.length > 0 && (
        <SubAgentThreads threads={entry.subtasks} />
      )}
      {entry.result !== undefined && (
        <CodeBlock
          code={entry.result || "(no output)"}
          title={failed ? "Error" : "Output"}
          hasLanguageLabel={false}
          size="sm"
          width="100%"
          maxHeight={240}
          isWrapped
        />
      )}
    </VStack>
  );
}

// One thinking or tool entry as a `ChatToolCalls` row. `isLast` — whether
// it's the transcript's last entry — is what makes an unfinished thought
// "Thinking…" rather than a thought the stream simply never closed.
export function toolCallFor(
  entry: PanelEntry,
  index: number,
  isLast: boolean,
): ChatToolCallItem | null {
  const key = String(index);
  if (entry.kind === "thinking") {
    const thinking = !entry.done && isLast;
    return {
      key,
      name: thinking ? "Thinking…" : "Thought",
      status: thinking ? "running" : "complete",
      resultDetail: entry.content.trim() ? (
        <VStack xstyle={styles.thought}>
          <Markdown content={entry.content} />
        </VStack>
      ) : undefined,
    };
  }
  if (entry.kind !== "tool") return null;
  const failed = isToolError(entry.result);
  const threads = entry.subtasks?.length ?? 0;
  return {
    key,
    name: entry.name,
    target:
      threads > 0
        ? plural(threads, "sub-agent", "sub-agents")
        : toolTarget(entry.args),
    status:
      entry.result === undefined ? "running" : failed ? "error" : "complete",
    errorMessage: failed ? firstLine(entry.result ?? "") : undefined,
    resultDetail: <ToolDetail entry={entry} />,
  };
}
