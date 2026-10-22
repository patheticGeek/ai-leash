import { useEffect, useRef, useState } from "react";
import { usePreference } from "@/data/preferences";
import { useStickToEnd } from "@/hooks/useStickToEnd";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import { cn } from "@/lib/utils";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/ui/message-scroller";
import {
  type ActivityItem,
  groupActivity,
  groupEntries,
  hasTurnActivity,
  isVisibleFinalChunk,
  type RenderItem,
} from "../../entryGrouping";
import type { PanelEntry } from "../../hooks/useChatStream";
import TranscriptNotices from "../banners/TranscriptNotices";
import EmptyTranscript from "../empty-states/EmptyTranscript";
import ActivityGroup from "./ActivityGroup";
import ChatEntryRenderer from "./ChatEntryRenderer";
import SystemPromptRow from "./SystemPromptRow";
import WorkingForIndicator from "./WorkingForIndicator";
import WorkSummary from "./WorkSummary";

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

export interface ChatEntryListProps {
  /** Classes for the transcript column (padding, alignment). */
  className?: string;
  /**
   * Height in px of something overlaid on the bottom of the list (the
   * message box): the transcript gets that much bottom padding so its last
   * line clears it, and the "Latest" button sits above it.
   */
  bottomInset?: number;
  entries: PanelEntry[];
  // These four are top-level-conversation-only concerns (Ollama/ACP-restore
  // banners, the collapsible system prompt block) — optional so a caller
  // with no such concept (e.g. `SubAgentChatTab.tsx`) doesn't need to pass
  // dummy values for all of them.
  chatError?: string | null;
  acpRestoreFailed?: string | null;
  onRetryAcpSession?: () => void;
  // True when the connected ACP agent has no way to pick up this
  // conversation's prior history (no `session/load` resume available) —
  // distinct from `acpRestoreFailed` (a resume was *attempted* and failed);
  // this is "never even had one to try." See `chat://{sessionId}/acp_history_truncated`.
  acpHistoryTruncated?: boolean;
  acpAgentLabel?: string | null;
  systemPrompt?: string | null;
  // False while a saved transcript is still loading, so an empty `entries`
  // doesn't flash the empty state first. Defaults to `true`.
  historyLoaded?: boolean;
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
// scroller: the notices and system prompt up top (`TranscriptNotices`,
// `SystemPromptRow`), the empty state, each entry via `ChatEntryRenderer.tsx`
// (runs of thinking/tool activity grouped by `ActivityGroup`, a finished
// turn's work folded behind `WorkSummary`), and the
// "Working for…" footer. Owns the per-entry UI-only state that's purely
// about *how* an already-loaded transcript is displayed (expand/collapse,
// copy feedback) — none of it is read anywhere outside this component.
export default function ChatEntryList({
  entries,
  chatError = null,
  acpRestoreFailed = null,
  onRetryAcpSession = () => {},
  acpHistoryTruncated = false,
  acpAgentLabel = null,
  systemPrompt = null,
  historyLoaded = true,
  sending,
  turnDurations,
  replyStartedAt,
  onRetry = () => {},
  allowRetry = true,
  className,
  bottomInset = 0,
}: ChatEntryListProps) {
  const [expandOverride, setExpandOverride] = useState<Record<number, boolean>>(
    {},
  );
  const collapseFinishedTurns = usePreference("collapseFinishedTurns");
  const { copy, copiedKey: copiedIndex } = useCopyToClipboard<number>();
  // Following the end is ours, not the scroller's `autoScroll` — see
  // `useStickToEnd`. The scroller still does the initial jump to the end and
  // the "Latest" button.
  const { viewportRef, contentRef, stick } = useStickToEnd();
  useStickOnUserMessage(entries, stick);

  function toggle(i: number) {
    setExpandOverride((prev) => ({ ...prev, [i]: !prev[i] }));
  }

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
        isLast={i === entries.length - 1}
        sending={sending}
        expanded={expandOverride[i] ?? false}
        onToggleExpand={() => toggle(i)}
        copied={copiedIndex === i}
        onCopy={() => copy(entry.kind === "text" ? entry.content : "", i)}
        onRetry={onRetry}
        turnDuration={summarizedReplies.has(i) ? undefined : turnDurations[i]}
        showFooter={showFooter}
        allowRetry={allowRetry}
      />
    );
  }

  function renderItem(item: ActivityItem) {
    return item.kind === "activitygroup" ? (
      <ActivityGroup
        entries={entries}
        indices={item.indices}
        renderEntry={renderEntry}
      />
    ) : (
      renderEntry(item.index)
    );
  }

  return (
    <MessageScrollerProvider defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport ref={viewportRef}>
          <MessageScrollerContent
            ref={contentRef}
            className={cn(
              "mx-auto w-full max-w-4xl gap-3 p-3 text-sm",
              className,
            )}
            style={bottomInset ? { paddingBottom: bottomInset } : undefined}
          >
            <TranscriptNotices
              chatError={chatError}
              acpRestoreFailed={acpRestoreFailed}
              onRetryAcpSession={onRetryAcpSession}
              acpHistoryTruncated={acpHistoryTruncated}
              acpAgentLabel={acpAgentLabel}
            />
            {systemPrompt && <SystemPromptRow systemPrompt={systemPrompt} />}
            {entries.length === 0 && historyLoaded && !chatError && (
              <EmptyTranscript />
            )}
            {items.map((item) => (
              <MessageScrollerItem
                key={itemKey(item)}
                className={item.kind === "activitygroup" ? "space-y-1.5" : ""}
              >
                {item.kind === "work" ? (
                  <WorkSummary
                    entries={entries}
                    indices={item.indices}
                    turnDuration={turnDurations[item.replyIndex]}
                  >
                    {groupActivity(entries, item.indices).map((inner) => (
                      <div
                        key={itemKey(inner)}
                        className={
                          inner.kind === "activitygroup" ? "space-y-1.5" : ""
                        }
                      >
                        {renderItem(inner)}
                      </div>
                    ))}
                  </WorkSummary>
                ) : (
                  renderItem(item)
                )}
              </MessageScrollerItem>
            ))}
            {sending && (
              <WorkingForIndicator
                hasActivity={hasTurnActivity(entries)}
                replyStartedAt={replyStartedAt}
              />
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton
          variant="outline"
          size="md"
          onClick={stick}
          // 1rem clear of the inset, matching the button's default `bottom-4`.
          style={bottomInset ? { bottom: bottomInset + 16 } : undefined}
        />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
