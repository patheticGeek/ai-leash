import {
  ChatLayoutScrollButton,
  ChatMessage,
  ChatMessageList,
} from "@astryxdesign/core/Chat";
import { ScrollableArea } from "@astryxdesign/core/ScrollableArea";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { type ReactNode, useEffect, useRef } from "react";
import { usePreference } from "@/data/preferences";
import { useStickToEnd } from "@/hooks/useStickToEnd";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import {
  type ActivityItem,
  groupActivity,
  groupEntries,
  hasTurnActivity,
  isVisibleFinalChunk,
  type RenderItem,
} from "../../entryGrouping";
import type { PanelEntry } from "../../hooks/useChatStream";
import ActivityGroup from "./ActivityGroup";
import ChatEntryRenderer from "./ChatEntryRenderer";
import SystemPromptRow from "./SystemPromptRow";
import TranscriptState from "./TranscriptState";
import WorkingForIndicator from "./WorkingForIndicator";
import WorkSummary from "./WorkSummary";

// The transcript column's width: `ChatLayout`'s at `density="spacious"`,
// the ai-chat template's layout density (§2.4 of prototype/PROPOSAL.md).
// The messages themselves stay at `ChatMessageList`'s balanced density.
const COLUMN_WIDTH = 800;

const styles = stylex.create({
  root: {
    position: "relative",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  viewport: {
    contain: "content",
  },
  column: {
    width: "100%",
    maxWidth: COLUMN_WIDTH,
    minHeight: "100%",
    marginInline: "auto",
    // The app's chrome is unselectable (`index.css`); a transcript is
    // something you copy from.
    userSelect: "text",
  },
  columnWide: {
    maxWidth: "none",
  },
  // Room at the bottom for whatever floats over it (the composer).
  inset: (px: number) => ({ paddingBlockEnd: px }),
  // Astryx's own scroll-to-bottom pill (`ChatLayout`'s): a full-width row
  // that centres it and keeps its --spacing-3 gap above whatever floats
  // over the bottom (the composer), stacked above the composer's fade.
  latest: {
    position: "absolute",
    insetInline: 0,
    zIndex: 1,
    pointerEvents: "none",
  },
  latestAt: (bottom: number) => ({ bottom }),
});

// Keyed on an item's first index, which stays stable as long as `entries`
// only ever grows (it does).
function itemKey(item: RenderItem): string {
  if (item.kind === "single") return String(item.index);
  return `${item.kind}-${item.indices[0]}`;
}

// Sending a message always jumps to the bottom and resumes following, even if
// the transcript was scrolled up.
function useStickOnUserMessage(entries: PanelEntry[], stick: () => void) {
  const userMessages = entries.filter(
    (e) => e.kind === "text" && e.role === "user",
  ).length;
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (previous.current !== null && userMessages > previous.current) {
      stick();
    }
    previous.current = userMessages;
  }, [userMessages, stick]);
}

// How the grouped items become `ChatMessageList` rows: a user message is
// its own `ChatMessage`, a note or local notice its own system row, and
// everything the agent did in between (activity, folded work, reply text)
// one assistant `ChatMessage`, so a turn's tool rows, prose and footer
// share one left edge.
type Row =
  | { kind: "user"; key: string; item: RenderItem }
  | { kind: "system"; key: string; item: RenderItem }
  | { kind: "assistant"; key: string; items: RenderItem[] };

function toRows(entries: PanelEntry[], items: RenderItem[]): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    if (item.kind === "single") {
      const entry = entries[item.index];
      if (entry.kind === "text" && entry.role === "user") {
        rows.push({ kind: "user", key: itemKey(item), item });
        continue;
      }
      if (entry.kind === "note" || entry.kind === "info") {
        rows.push({ kind: "system", key: itemKey(item), item });
        continue;
      }
    }
    const last = rows[rows.length - 1];
    if (last?.kind === "assistant") last.items.push(item);
    else rows.push({ kind: "assistant", key: itemKey(item), items: [item] });
  }
  return rows;
}

export interface ChatEntryListProps {
  /**
   * A narrow column (`ChatPanel`'s `compact`): the transcript uses the
   * whole width at compact density instead of the centred column.
   */
  isCompact?: boolean;
  /**
   * Height in px of something overlaid on the bottom of the list (the
   * message box): the transcript gets that much bottom padding so its last
   * line clears it, and the scroll-to-bottom button sits above it.
   */
  bottomInset?: number;
  entries: PanelEntry[];
  // Top-level-conversation-only (the system prompt line) — optional so a
  // caller with no such concept (`SubAgentChatTab.tsx`) needn't pass it.
  systemPrompt?: string | null;
  // False while a saved transcript is still loading, so an empty `entries`
  // shows skeletons rather than flashing the empty state. Defaults to `true`.
  historyLoaded?: boolean;
  // Why the saved transcript couldn't be loaded, with a way to try again.
  historyError?: string | null;
  onReloadHistory?: () => void;
  sending: boolean;
  turnDurations: Record<number, number>;
  replyStartedAt: number | null;
  onRetry?: () => void;
  // Whether the last reply's footer may show a Retry button — see
  // `ChatEntryRenderer`'s doc comment on the same prop. Defaults to `true`;
  // `ChatPanel` passes its backend's `caps.retry`.
  allowRetry?: boolean;
}

// Renders a conversation's whole `entries` array inside the message
// scroller as Astryx's ai-chat parts: `ChatMessageList` in a centred
// column, the system prompt up top (`SystemPromptRow`), each entry via
// `ChatEntryRenderer.tsx` (runs of thinking/tool activity grouped by
// `ActivityGroup`, a finished turn's work folded behind `WorkSummary`), the
// "Working for…" line, and the empty / loading / error states
// (`TranscriptState`). The notices (provider error, failed restore, history
// not shared) aren't here: they're `TranscriptNotices`, in the banner stack
// above the composer. Owns the copy feedback; the expand/collapse state of
// each row lives in its `ChatToolCalls` / `SystemNotice`.
export default function ChatEntryList({
  entries,
  systemPrompt = null,
  historyLoaded = true,
  historyError = null,
  onReloadHistory = () => {},
  sending,
  turnDurations,
  replyStartedAt,
  onRetry = () => {},
  allowRetry = true,
  isCompact = false,
  bottomInset = 0,
}: ChatEntryListProps) {
  const collapseFinishedTurns = usePreference("collapseFinishedTurns");
  const { copy, copiedKey: copiedIndex } = useCopyToClipboard<number>();
  // Following the end — including the initial jump there — and whether to
  // offer the scroll-to-bottom button are `useStickToEnd`'s.
  const { viewportRef, contentRef, stick, atEnd } = useStickToEnd();
  useStickOnUserMessage(entries, stick);

  const items = groupEntries(entries, sending, collapseFinishedTurns);
  // Replies whose turn time is already shown on their `WorkSummary` row, so
  // the footer doesn't repeat it.
  const summarizedReplies = new Set(
    items.flatMap((item) => (item.kind === "work" ? [item.replyIndex] : [])),
  );

  function renderEntry(i: number) {
    const entry = entries[i];
    const showFooter =
      entry.kind === "text" &&
      (entry.role === "user" || isVisibleFinalChunk(entries, i, sending));
    return (
      <ChatEntryRenderer
        key={i}
        entry={entry}
        index={i}
        isLast={i === entries.length - 1}
        sending={sending}
        copied={copiedIndex === i}
        onCopy={() => copy(entry.kind === "text" ? entry.content : "", i)}
        onRetry={onRetry}
        turnDuration={summarizedReplies.has(i) ? undefined : turnDurations[i]}
        showFooter={showFooter}
        allowRetry={allowRetry}
      />
    );
  }

  function renderActivity(item: ActivityItem): ReactNode {
    return item.kind === "activitygroup" ? (
      <ActivityGroup
        key={itemKey(item)}
        entries={entries}
        indices={item.indices}
      />
    ) : (
      renderEntry(item.index)
    );
  }

  function renderItem(item: RenderItem): ReactNode {
    if (item.kind !== "work") return renderActivity(item);
    return (
      <WorkSummary
        key={itemKey(item)}
        entries={entries}
        indices={item.indices}
        turnDuration={turnDurations[item.replyIndex]}
      >
        {groupActivity(entries, item.indices).map(renderActivity)}
      </WorkSummary>
    );
  }

  const rows = toRows(entries, items);
  const working = sending ? (
    <WorkingForIndicator
      hasActivity={hasTurnActivity(entries)}
      replyStartedAt={replyStartedAt}
    />
  ) : null;
  // The running turn's line goes at the end of its assistant message, or
  // starts one if the agent hasn't produced anything yet.
  const workingInLastRow = rows[rows.length - 1]?.kind === "assistant";

  let state: ReactNode = null;
  if (entries.length === 0) {
    if (historyError) {
      state = (
        <TranscriptState
          state="error"
          error={historyError}
          onRetry={onReloadHistory}
        />
      );
    } else if (!historyLoaded) {
      state = <TranscriptState state="loading" />;
    } else if (!sending) {
      state = <TranscriptState state="empty" />;
    }
  }

  return (
    <VStack xstyle={styles.root}>
      <ScrollableArea
        ref={viewportRef}
        label="Transcript"
        overscroll="contain"
        height="100%"
        xstyle={styles.viewport}
      >
        <VStack
          ref={contentRef}
          xstyle={[
            styles.column,
            isCompact && styles.columnWide,
            bottomInset > 0 && styles.inset(bottomInset),
          ]}
        >
          <ChatMessageList
            // Balanced, `ChatMessageList`'s default and what the ai-chat
            // template and prototype use: `ChatLayout`'s "spacious" sizes the
            // column, not the messages, whose spacious bubbles pad 16/20.
            density={isCompact ? "compact" : "balanced"}
            isStreaming={sending}
            emptyState={state}
          >
            {/* No children at all while a state shows: `ChatMessageList`
                only renders `emptyState` for nullish children. */}
            {state === null ? (
              <>
                {systemPrompt && (
                  <SystemPromptRow systemPrompt={systemPrompt} />
                )}
                {rows.map((row, r) => {
                  if (row.kind === "user") {
                    return (
                      <ChatMessage key={row.key} sender="user">
                        {renderItem(row.item)}
                      </ChatMessage>
                    );
                  }
                  if (row.kind === "system") {
                    return (
                      <ChatMessage key={row.key} sender="system">
                        {renderItem(row.item)}
                      </ChatMessage>
                    );
                  }
                  return (
                    <ChatMessage key={row.key} sender="assistant">
                      {row.items.map(renderItem)}
                      {workingInLastRow && r === rows.length - 1 && working}
                    </ChatMessage>
                  );
                })}
                {working && !workingInLastRow && (
                  <ChatMessage sender="assistant">{working}</ChatMessage>
                )}
              </>
            ) : null}
          </ChatMessageList>
        </VStack>
      </ScrollableArea>
      <ChatLayoutScrollButton
        isVisible={!atEnd}
        onClick={stick}
        xstyle={[styles.latest, styles.latestAt(bottomInset)]}
      />
    </VStack>
  );
}
