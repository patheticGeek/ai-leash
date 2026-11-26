import {
  ChatLayoutScrollButton,
  ChatMessage,
  ChatMessageList,
} from "@astryxdesign/core/Chat";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePreference } from "@/data/preferences";
import { useStickToEnd } from "@/hooks/useStickToEnd";
import { uiBlocksToText } from "@/lib/uiSpec";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import {
  type ActivityItem,
  type DisplayItem,
  firstIndex,
  groupActivity,
  groupEntries,
  hasTurnActivity,
  isSubAgentResult,
  isVisibleFinalChunk,
  type RenderItem,
  toDisplayItems,
} from "../../entryGrouping";
import type { PanelEntry } from "../../hooks/useChatStream";
import ActivityGroup from "./ActivityGroup";
import ChatEntryRenderer from "./ChatEntryRenderer";
import SystemPromptRow from "./SystemPromptRow";
import TranscriptState from "./TranscriptState";
import WorkingForIndicator from "./WorkingForIndicator";
import WorkSummary from "./WorkSummary";

// The transcript column's width: `ChatLayout`'s at `density="spacious"`,
// the ai-chat template's layout density.
// The messages themselves stay at `ChatMessageList`'s balanced density.
const COLUMN_WIDTH = 800;

const styles = stylex.create({
  root: {
    position: "relative",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  // A plain, always-scrolling viewport, as `ChatLayout`'s own is — not
  // Astryx's `ScrollableArea`, which only becomes a scroll container once
  // it has measured its content in a later frame. Until then a write to
  // `scrollTop` is ignored, so a chat that mounts (or whose history
  // arrives) with more than a screenful would open at its first message,
  // and `useStickToEnd` gets no resize to try again on.
  viewport: {
    height: "100%",
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehavior: "contain",
    contain: "content",
  },
  column: {
    width: "100%",
    maxWidth: COLUMN_WIDTH,
    minHeight: "100%",
    // A flex item of the viewport: without this it would shrink to the
    // viewport's height and overflow it, so its box (which
    // `useStickToEnd`'s ResizeObserver watches) would never grow.
    flexShrink: 0,
    marginInline: "auto",
    // The app's chrome is unselectable (`index.css`); a transcript is
    // something you copy from.
    userSelect: "text",
  },
  columnWide: {
    maxWidth: "none",
  },
  // A fade at the top edge (under the tab strip) while there's more
  // transcript scrolled away above: the surface colour to transparent, the
  // same colour the composer's fade uses at the bottom.
  topFade: {
    position: "absolute",
    insetBlockStart: 0,
    insetInline: 0,
    height: spacingVars["--spacing-8"],
    zIndex: 1,
    pointerEvents: "none",
    backgroundImage: `linear-gradient(to bottom, ${colorVars["--color-background-surface"]}, transparent)`,
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: "150ms",
  },
  topFadeShown: { opacity: 1 },
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

// The default `onRetry`/`onReloadHistory`: one function, not a new closure
// per render, so the `memo`'d rows don't re-render for it.
function noop() {}

// Keyed on an item's first index (`firstIndex`), which stays stable as long
// as `entries` only ever grows (it does). A short run's `steps` and the
// `activitygroup` it grows into share one key, so its `ActivityGroup` stays
// mounted when the third step arrives.
function itemKey(item: DisplayItem): string {
  if (item.kind === "single") return String(item.index);
  const kind = item.kind === "work" ? "work" : "run";
  return `${kind}-${item.indices[0]}`;
}

// Whether the viewport is scrolled away from its top (drives the top fade).
// One passive scroll listener; state only changes when the answer flips.
function useScrolledFromTop(viewportRef: RefObject<HTMLElement | null>) {
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setIsScrolled(viewport.scrollTop > 0);
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    return () => viewport.removeEventListener("scroll", update);
  }, [viewportRef]);
  return isScrolled;
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
// its own `ChatMessage`; another chat's message, a note, a local notice or
// a sub-agent's result its own system row; and everything the agent did in
// between (activity, folded work, reply text) one assistant `ChatMessage`,
// so a turn's tool rows, prose and footer share one left edge.
type Row =
  | { kind: "user"; key: string; item: RenderItem }
  | { kind: "system"; key: string; item: RenderItem }
  | { kind: "assistant"; key: string; items: RenderItem[] };

function toRows(entries: PanelEntry[], items: RenderItem[]): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    if (item.kind === "single") {
      const entry = entries[item.index];
      if (entry.kind === "text" && entry.role === "user" && !entry.from) {
        rows.push({ kind: "user", key: String(item.index), item });
        continue;
      }
      // Another chat's message or note, a local notice, or a sub-agent's
      // result: a line of its own, outside any agent turn.
      if (
        (entry.kind === "text" && entry.role === "user") ||
        entry.kind === "note" ||
        entry.kind === "info" ||
        isSubAgentResult(entry)
      ) {
        rows.push({ kind: "system", key: String(item.index), item });
        continue;
      }
    }
    const last = rows[rows.length - 1];
    if (last?.kind === "assistant") last.items.push(item);
    // Keyed on the turn's first entry whatever its item is, which changes
    // kind as the turn goes on (a step becoming part of an `activitygroup`,
    // the work folding into `work`): the row must not remount for that.
    else {
      rows.push({
        kind: "assistant",
        key: String(firstIndex(item)),
        items: [item],
      });
    }
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
  // A line at the very top of the transcript, where a top-level
  // conversation's system prompt goes (`SubAgentChatTab`'s status line).
  leading?: ReactNode;
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
  leading = null,
  historyLoaded = true,
  historyError = null,
  onReloadHistory = noop,
  sending,
  turnDurations,
  replyStartedAt,
  onRetry = noop,
  allowRetry = true,
  isCompact = false,
  bottomInset = 0,
}: ChatEntryListProps) {
  const collapseFinishedTurns = usePreference("collapseFinishedTurns");
  const { copy, copiedKey: copiedIndex } = useCopyToClipboard<number>();
  // Stable callbacks for the `memo`'d rows (`ChatEntryRenderer`): a new
  // closure per render would re-render every row on every streamed chunk.
  // `onRetry` is read through a ref so the caller needn't keep it stable.
  const copyRef = useRef(copy);
  const retryRef = useRef(onRetry);
  useEffect(() => {
    copyRef.current = copy;
    retryRef.current = onRetry;
  });
  const copyEntry = useCallback(
    // A ```ui block copies as its readable text (tables as Markdown tables,
    // stats as lines, …), not its JSON.
    (text: string, index: number) =>
      copyRef.current(uiBlocksToText(text), index),
    [],
  );
  const retry = useCallback(() => retryRef.current(), []);
  // Following the end — including the initial jump there — and whether to
  // offer the scroll-to-bottom button are `useStickToEnd`'s.
  const { viewportRef, contentRef, stick, atEnd } = useStickToEnd();
  const isScrolledFromTop = useScrolledFromTop(viewportRef);
  useStickOnUserMessage(entries, stick);

  const items = groupEntries(entries, sending, collapseFinishedTurns);
  // Replies whose turn time is already shown on their `WorkSummary` row, so
  // the footer doesn't repeat it.
  const summarizedReplies = new Set(
    items.flatMap((item) =>
      item.kind === "work" && item.replyIndex !== null ? [item.replyIndex] : [],
    ),
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
        onCopy={copyEntry}
        onRetry={retry}
        turnDuration={summarizedReplies.has(i) ? undefined : turnDurations[i]}
        showFooter={showFooter}
        allowRetry={allowRetry}
      />
    );
  }

  function renderActivity(item: DisplayItem<ActivityItem>): ReactNode {
    return item.kind !== "single" ? (
      <ActivityGroup
        key={itemKey(item)}
        entries={entries}
        indices={item.indices}
      />
    ) : (
      renderEntry(item.index)
    );
  }

  function renderItem(item: DisplayItem): ReactNode {
    if (item.kind !== "work") return renderActivity(item);
    return (
      <WorkSummary
        key={itemKey(item)}
        entries={entries}
        indices={item.indices}
        turnDuration={
          item.replyIndex === null ? undefined : turnDurations[item.replyIndex]
        }
      >
        {toDisplayItems(entries, groupActivity(entries, item.indices)).map(
          renderActivity,
        )}
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

  // The empty and error states centre in the list (its `emptyState`); the
  // loading skeleton is rendered as content instead, so the list's bottom
  // alignment puts it where the latest messages are about to appear.
  let state: ReactNode = null;
  let loading: ReactNode = null;
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
      loading = <TranscriptState state="loading" />;
    } else if (!sending) {
      state = <TranscriptState state="empty" />;
    }
  }

  return (
    <VStack xstyle={styles.root}>
      <VStack
        aria-hidden
        xstyle={[styles.topFade, isScrolledFromTop && styles.topFadeShown]}
      />
      <VStack
        ref={viewportRef}
        role="group"
        aria-label="Transcript"
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
            // template uses: `ChatLayout`'s "spacious" sizes the
            // column, not the messages, whose spacious bubbles pad 16/20.
            density={isCompact ? "compact" : "balanced"}
            isStreaming={sending}
            emptyState={state}
          >
            {/* One child expression: `ChatMessageList` shows `emptyState`
                only when its children are nullish, not an array of nulls. */}
            {loading ??
              (state === null ? (
                <>
                  {leading}
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
                        {toDisplayItems(entries, row.items).map(renderItem)}
                        {workingInLastRow && r === rows.length - 1 && working}
                      </ChatMessage>
                    );
                  })}
                  {working && !workingInLastRow && (
                    <ChatMessage sender="assistant">{working}</ChatMessage>
                  )}
                </>
              ) : null)}
          </ChatMessageList>
        </VStack>
      </VStack>
      <ChatLayoutScrollButton
        isVisible={!atEnd}
        onClick={stick}
        xstyle={[styles.latest, styles.latestAt(bottomInset)]}
      />
    </VStack>
  );
}
