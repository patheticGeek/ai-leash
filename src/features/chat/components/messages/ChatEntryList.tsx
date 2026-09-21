import { useEffect, useRef, useState } from "react";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import { cn } from "@/lib/utils";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/ui/message-scroller";
import {
  groupEntries,
  hasTurnActivity,
  isVisibleFinalChunk,
} from "../../entryGrouping";
import type { PanelEntry } from "../../hooks/useChatStream";
import TranscriptNotices from "../banners/TranscriptNotices";
import EmptyTranscript from "../empty-states/EmptyTranscript";
import ActivityGroup from "./ActivityGroup";
import ChatEntryRenderer from "./ChatEntryRenderer";
import SystemPromptRow from "./SystemPromptRow";
import WorkingForIndicator from "./WorkingForIndicator";

// Sending a message always jumps to the bottom, even if the transcript was
// scrolled up (or the scroller had stopped following it) — the scroller's own
// auto-follow only applies while you're already at the bottom. Lives inside
// the provider because `useMessageScroller` needs its context.
function ScrollToEndOnUserMessage({ entries }: { entries: PanelEntry[] }) {
  const { scrollToEnd } = useMessageScroller();
  const userMessages = entries.filter(
    (e) => e.kind === "text" && e.role === "user",
  ).length;
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (previous.current !== null && userMessages > previous.current) {
      scrollToEnd({ behavior: "auto" });
    }
    previous.current = userMessages;
  }, [userMessages, scrollToEnd]);
  return null;
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
  ollamaError?: string | null;
  acpRestoreFailed?: string | null;
  onRetryAcpSession?: () => void;
  // True when the connected ACP agent has no way to pick up this
  // conversation's prior history (no `session/load` resume available) —
  // distinct from `acpRestoreFailed` (a resume was *attempted* and failed);
  // this is "never even had one to try." See `chat://{sessionId}/acp_history_truncated`.
  acpHistoryTruncated?: boolean;
  acpAgentLabel?: string | null;
  systemPrompt?: string | null;
  sending: boolean;
  isAcp: boolean;
  turnDurations: Record<number, number>;
  replyStartedAt: number | null;
  onRetry?: () => void;
  // Whether the last reply's footer may show a Retry button — see
  // `ChatEntryRenderer`'s doc comment on the same prop. Defaults to `true`
  // (top-level conversations always have a real retry_last to call).
  allowRetry?: boolean;
}

// Renders a conversation's whole `entries` array inside the message
// scroller: the notices and system prompt up top (`TranscriptNotices`,
// `SystemPromptRow`), the empty state, each entry via `ChatEntryRenderer.tsx`
// (runs of thinking/tool activity grouped by `ActivityGroup`), and the
// "Working for…" footer. Owns the per-entry UI-only state that's purely
// about *how* an already-loaded transcript is displayed (expand/collapse,
// copy feedback) — none of it is read anywhere outside this component.
export default function ChatEntryList({
  entries,
  ollamaError = null,
  acpRestoreFailed = null,
  onRetryAcpSession = () => {},
  acpHistoryTruncated = false,
  acpAgentLabel = null,
  systemPrompt = null,
  sending,
  isAcp,
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
  const { copy, copiedKey: copiedIndex } = useCopyToClipboard<number>();

  function toggle(i: number) {
    setExpandOverride((prev) => ({ ...prev, [i]: !prev[i] }));
  }

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
        isAcp={isAcp}
        sending={sending}
        expanded={expandOverride[i] ?? false}
        onToggleExpand={() => toggle(i)}
        copied={copiedIndex === i}
        onCopy={() => copy(entry.kind === "text" ? entry.content : "", i)}
        onRetry={onRetry}
        turnDuration={turnDurations[i]}
        showFooter={showFooter}
        allowRetry={allowRetry}
      />
    );
  }

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <ScrollToEndOnUserMessage entries={entries} />
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent
            className={cn(
              "mx-auto w-full max-w-4xl gap-3 p-3 text-sm",
              className,
            )}
            style={bottomInset ? { paddingBottom: bottomInset } : undefined}
          >
            <TranscriptNotices
              ollamaError={ollamaError}
              acpRestoreFailed={acpRestoreFailed}
              onRetryAcpSession={onRetryAcpSession}
              acpHistoryTruncated={acpHistoryTruncated}
              acpAgentLabel={acpAgentLabel}
            />
            {systemPrompt && <SystemPromptRow systemPrompt={systemPrompt} />}
            {entries.length === 0 && !ollamaError && <EmptyTranscript />}
            {groupEntries(entries).map((item) =>
              item.kind === "activitygroup" ? (
                <MessageScrollerItem
                  // Keyed on the run's first index, which stays stable as
                  // long as `entries` only ever grows (it does).
                  key={`activity-${item.indices[0]}`}
                  className="space-y-1.5"
                >
                  <ActivityGroup
                    entries={entries}
                    indices={item.indices}
                    renderEntry={renderEntry}
                  />
                </MessageScrollerItem>
              ) : (
                <MessageScrollerItem key={item.index}>
                  {renderEntry(item.index)}
                </MessageScrollerItem>
              ),
            )}
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
          // 1rem clear of the inset, matching the button's default `bottom-4`.
          style={bottomInset ? { bottom: bottomInset + 16 } : undefined}
        />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
