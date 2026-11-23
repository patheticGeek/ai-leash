// The transcript, on the ai-chat template's parts. ai leash's own rows map
// onto those parts instead of being restyled lookalikes, so the transcript
// reads as one system:
//   Worked-for summary, ActivityGroup, thinking  -> ChatToolCalls group / rows
//   spawn_sub_agent and its threads              -> ChatToolCalls row, threads
//                                                   as a compact List in resultDetail
//   system-context row, notes                    -> ChatSystemMessage with an icon
//   messages from other chats                    -> user bubble with its name slot
//   message footer, Working-for                  -> ChatMessageMetadata
// Agent turns have no avatar: their bubbles span the transcript column.
// Grouping logic (entryGrouping.ts in the app) is unchanged; only the parts.
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatMessageMetadata,
  ChatSystemMessage,
  ChatToolCalls,
} from "@astryxdesign/core/Chat";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  InboxArrowDownIcon,
} from "../icons-lucide";
import { SUB_AGENTS } from "../data";

const stateStyles = stylex.create({
  fill: { minHeight: "100%" },
});

function Time({ at }: { at: string }) {
  return <Timestamp value={`2026-11-23T${at}:00`} format="time" />;
}

function MessageActions({ canRetry }: { canRetry?: boolean }) {
  return (
    <HStack gap={0.5} vAlign="center">
      <IconButton variant="ghost" size="sm" label="Copy" icon={<Icon icon={ClipboardDocumentIcon} size="sm" />} />
      {canRetry && (
        <IconButton variant="ghost" size="sm" label="Retry" icon={<Icon icon={ArrowPathIcon} size="sm" />} />
      )}
    </HStack>
  );
}

function SubAgentThreads() {
  return (
    <List density="compact" edge="flush">
      {SUB_AGENTS.slice(0, 2).map((s) => (
        <ListItem
          key={s.id}
          label={s.description}
          description={`${s.model} · ${s.latest}`}
          startContent={
            s.state === "running" ? (
              <StatusDot variant="accent" isPulsing label="Running" />
            ) : (
              <StatusDot variant="success" label="Finished" />
            )
          }
          endContent={
            <HStack gap={1} vAlign="center">
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {s.elapsed}
              </Text>
              <IconButton
                variant="ghost"
                size="sm"
                label="Open its conversation"
                icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />}
              />
            </HStack>
          }
        />
      ))}
    </List>
  );
}

const THOUGHT =
  "The lane label has to stick inside the horizontal scroller, not the page, or it scrolls away with the columns.";

const DIFF = `@@ -112,6 +112,18 @@ function EpicLane({ epic, tasks }) {
-  <HStack gap={4}>
+  <HStack gap={4} xstyle={styles.lane}>
+    <VStack xstyle={styles.laneLabel}>
+      <Token label={epic.name} color={epic.color} />
+      <Text type="supporting">{tasks.length} tasks</Text>
+    </VStack>`;

export default function Transcript({ isWorking = true }: { isWorking?: boolean }) {
  return (
    <ChatMessageList>
      <ChatSystemMessage icon={<Icon icon={DocumentTextIcon} size="sm" />}>
        System context: AGENTS.md, docs/AGENTS.md, project memory, 3 skills, 4 actions
      </ChatSystemMessage>
      <ChatSystemMessage variant="divider">Today</ChatSystemMessage>

      {/* A message from the project chat, which started this task. */}
      <ChatMessage sender="user">
        <ChatMessageBubble
          name={<Text type="supporting" color="secondary">From Project chat</Text>}
          metadata={<ChatMessageMetadata timestamp={<Time at="10:02" />} />}
        >
          #42 Astryx: board on the kanban template. Rebuild BoardView on the kanban-board template,
          keep dnd-kit, and add the group-by-epic swimlanes.
        </ChatMessageBubble>
      </ChatMessage>

      {/* A finished turn: its activity folds into one Worked-for row. */}
      <ChatMessage sender="assistant">
        <ChatToolCalls
          label="Worked for 4m 51s · 1 thought, 4 tools used"
          calls={[
            { name: "Thought", target: "for 9s", status: "complete" },
            { name: "read", target: "src/features/board/BoardView.tsx", status: "complete", duration: "41ms" },
            { name: "read", target: "src/features/board/TaskCard.tsx", status: "complete", duration: "28ms" },
            { name: "edit", target: "src/features/board/BoardView.tsx", status: "complete", duration: "92ms", additions: 64, deletions: 41 },
            { name: "bash", target: "npx tsc --noEmit", status: "complete", duration: "6.1s" },
          ]}
        />
        <ChatMessageBubble variant="ghost" width="100%">
          <Markdown density="compact">{`The board now renders on the template's frame: a \`LayoutHeader\` toolbar, one muted \`Card\` per column with a status dot and count, and cards with number, priority and effort.

- **Group by epic** draws one swimlane per epic under a shared column header
- **Show done** adds the Done column, with **Load older** at its foot
- Drag still goes through dnd-kit; I kept \`BoardView\`'s sensors as they were`}</Markdown>
        </ChatMessageBubble>
        <ChatMessageMetadata
          timestamp={<Time at="10:07" />}
          footer={<MessageActions />}
        />
      </ChatMessage>

      <ChatSystemMessage icon={<Icon icon={InboxArrowDownIcon} size="sm" />}>
        Note from #40 Terminal: honour code font size — moved to Review
      </ChatSystemMessage>

      <ChatMessage sender="user">
        <ChatMessageBubble metadata={<ChatMessageMetadata timestamp={<Time at="10:11" />} />}>
          Looks good. In group-by-epic, keep the epic name pinned left while scrolling sideways, and check
          that dragging a card into another epic's row changes its epic.
        </ChatMessageBubble>
      </ChatMessage>

      {/* The turn in progress. */}
      <ChatMessage sender="assistant">
        <ChatToolCalls
          calls={[
            {
              name: "Thought",
              target: "for 6s",
              status: "complete",
              resultDetail: <Text color="secondary">{THOUGHT}</Text>,
            },
            { name: "read", target: "src/features/board/BoardView.tsx", status: "complete", duration: "41ms" },
            { name: "grep", target: "position: sticky src/features", status: "complete", duration: "120ms" },
          ]}
        />
        <ChatToolCalls
          calls={[
            {
              name: "spawn_sub_agent",
              target: "2 sub-agents",
              status: isWorking ? "running" : "complete",
              resultDetail: <SubAgentThreads />,
            },
          ]}
        />
        <ChatMessageBubble variant="ghost" width="100%">
          While those run I'll make the lane label sticky inside the scroller.
        </ChatMessageBubble>
        <ChatToolCalls
          calls={[
            {
              name: "edit",
              target: "src/features/board/BoardView.tsx",
              status: isWorking ? "running" : "complete",
              additions: 18,
              deletions: 6,
              resultDetail: <CodeBlock code={DIFF} language="tsx" isDiff size="sm" width="100%" title="BoardView.tsx" />,
            },
          ]}
        />
        {isWorking ? (
          <ChatMessageMetadata
            footer={
              <HStack gap={2} vAlign="center">
                <Spinner size="sm" aria-label="Working" />
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  Working for 3:12
                </Text>
              </HStack>
            }
          />
        ) : (
          <ChatMessageMetadata
            timestamp={<Time at="10:16" />}
            footer={<MessageActions canRetry />}
          />
        )}
      </ChatMessage>
    </ChatMessageList>
  );
}

/** Transcript empty / loading / error: EmptyState and Skeleton per Astryx. */
export function TranscriptState({ state }: { state: "empty" | "loading" | "error" }) {
  if (state === "loading") {
    // Skeletons in the transcript's own shapes: a user bubble on the end,
    // agent prose lines across the column, a tool row.
    return (
      <VStack gap={8} paddingBlock={6}>
        <HStack hAlign="end">
          <Skeleton width={360} height={56} radius={4} />
        </HStack>
        <VStack gap={2}>
          <Skeleton width="92%" height={14} index={1} />
          <Skeleton width="84%" height={14} index={2} />
          <Skeleton width="60%" height={14} index={3} />
        </VStack>
        <Skeleton width={280} height={12} index={4} />
        <HStack hAlign="end">
          <Skeleton width={240} height={40} radius={4} index={5} />
        </HStack>
        <VStack gap={2}>
          <Skeleton width="88%" height={14} index={6} />
          <Skeleton width="48%" height={14} index={7} />
        </VStack>
      </VStack>
    );
  }
  const isError = state === "error";
  return (
    <VStack vAlign="center" xstyle={stateStyles.fill}>
      <EmptyState
        icon={
          <Icon
            icon={isError ? ExclamationTriangleIcon : ChatBubbleLeftRightIcon}
            size="lg"
            color={isError ? "error" : "secondary"}
          />
        }
        title={isError ? "Couldn't load this conversation" : "No messages yet"}
        description={
          isError
            ? "conversations/7f3a2c.json isn't valid JSON (line 1, column 2048). Nothing was deleted."
            : "Ask the agent something. It starts with AGENTS.md, project memory, 3 skills and 4 actions."
        }
        actions={
          isError ? (
            <HStack gap={2}>
              <Button label="Show file" variant="secondary" />
              <Button label="Try again" variant="primary" icon={<Icon icon={ArrowPathIcon} size="sm" />} />
            </HStack>
          ) : undefined
        }
      />
    </VStack>
  );
}
