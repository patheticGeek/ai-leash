import { ChevronDown, MessageCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button";
import type { PanelEntry } from "../hooks/useChatStream";
import ChatEntryRenderer, {
  Chevron,
  formatDuration,
} from "./ChatEntryRenderer";

export interface ChatEntryListProps {
  entries: PanelEntry[];
  ollamaError: string | null;
  acpRestoreFailed: string | null;
  onRetryAcpSession: () => void;
  claudeRateLimit: { message: string; resetAt: number } | null;
  claudeAutoResumeArmed: boolean;
  onArmClaudeAutoResume: () => void;
  onDismissClaudeRateLimit: () => void;
  systemPrompt: string | null;
  sending: boolean;
  isAcp: boolean;
  turnDurations: Record<number, number>;
  replyStartedAt: number | null;
  nowTick: number;
  onRetry: () => void;
}

function formatClockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Whether the assistant text entry at `i` is the last chunk of its turn —
// a turn's reply can be split into several text entries by tool calls
// interleaved in between (see the backend's `TurnSegment`), and only the
// final chunk should show the copy/timestamp/"Worked for" footer, not every
// intermediate one.
function isFinalAssistantChunk(entries: PanelEntry[], i: number): boolean {
  for (let j = i + 1; j < entries.length; j++) {
    const e = entries[j];
    if (e.kind === "text") {
      if (e.role === "assistant") return false;
      break;
    }
  }
  return true;
}

// Renders a conversation's whole `entries` array: the collapsible system
// prompt block, the empty/error states, each entry via
// `ChatEntryRenderer.tsx` (grouping consecutive thinking/tool activity so
// only the latest of a run shows by default), and the "Working for…" footer. Owns
// every piece of UI-only state that's purely about *how* an already-loaded
// transcript is displayed (expand/collapse, copy-feedback, scroll
// position) — none of it is read anywhere outside this component.
export default function ChatEntryList({
  entries,
  ollamaError,
  acpRestoreFailed,
  onRetryAcpSession,
  claudeRateLimit,
  claudeAutoResumeArmed,
  onArmClaudeAutoResume,
  onDismissClaudeRateLimit,
  systemPrompt,
  sending,
  isAcp,
  turnDurations,
  replyStartedAt,
  nowTick,
  onRetry,
}: ChatEntryListProps) {
  const [expandOverride, setExpandOverride] = useState<Record<number, boolean>>(
    {},
  );
  // Consecutive thinking/tool entries are grouped so only the latest one
  // shows by default (see `renderItems` below) — keyed by the group's first
  // index, which stays stable as long as `entries` only ever grows (it does),
  // tracking whether that group has been expanded to show the full activity
  // run rather than just the latest entry.
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>(
    {},
  );
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [systemPromptExpanded, setSystemPromptExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: entries is a trigger-only dep — re-run the scroll check on every new message, its value isn't read in the body
  useEffect(() => {
    if (autoScrollRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [entries]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < 40;
  }

  function isExpanded(i: number): boolean {
    return expandOverride[i] ?? false;
  }

  function toggle(i: number) {
    setExpandOverride((prev) => ({ ...prev, [i]: !isExpanded(i) }));
  }

  function toggleGroup(key: string) {
    setGroupExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function copyText(i: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex((cur) => (cur === i ? null : cur)), 1200);
  }

  // Whether this turn has produced anything visible yet — before that, the
  // bottom indicator shows "Waiting" rather than a running clock, since
  // there's nothing to measure the *progress* of yet, just the wait for the
  // model to respond at all.
  const lastEntry = entries[entries.length - 1];
  const hasActivity = !!(
    lastEntry &&
    ((lastEntry.kind === "text" && lastEntry.role === "assistant") ||
      lastEntry.kind === "thinking" ||
      lastEntry.kind === "tool")
  );

  // Groups runs of consecutive thinking/tool entries so the transcript can
  // show only the latest activity by default (see the "activitygroup" branch
  // below) instead of every individual step — a multi-step agent turn can
  // otherwise bury the actual conversation.
  type RenderItem =
    | { kind: "single"; index: number }
    | { kind: "activitygroup"; indices: number[] };
  const renderItems: RenderItem[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].kind === "thinking" || entries[i].kind === "tool") {
      const last = renderItems[renderItems.length - 1];
      if (last && last.kind === "activitygroup") {
        last.indices.push(i);
      } else {
        renderItems.push({ kind: "activitygroup", indices: [i] });
      }
    } else {
      renderItems.push({ kind: "single", index: i });
    }
  }

  function renderEntry(i: number) {
    const entry = entries[i];
    const showFooter =
      entry.kind !== "text" ||
      entry.role === "user" ||
      isFinalAssistantChunk(entries, i);
    return (
      <ChatEntryRenderer
        key={i}
        entry={entry}
        isLast={i === entries.length - 1}
        isAcp={isAcp}
        sending={sending}
        expanded={isExpanded(i)}
        onToggleExpand={() => toggle(i)}
        copied={copiedIndex === i}
        onCopy={() => copyText(i, entry.kind === "text" ? entry.content : "")}
        onRetry={onRetry}
        turnDuration={turnDurations[i]}
        showFooter={showFooter}
      />
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="h-full overflow-y-auto p-3 space-y-3 text-sm"
    >
      {systemPrompt && (
        <div className="text-xs">
          <Button
            variant="unstyled"
            size="none"
            onClick={() => setSystemPromptExpanded((v) => !v)}
            className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-zinc-600 hover:bg-white/5 hover:text-zinc-400"
          >
            <Chevron expanded={systemPromptExpanded} />
            <span className="italic">system prompt</span>
          </Button>
          {systemPromptExpanded && (
            <pre className="mt-1 ml-4 max-h-64 overflow-auto whitespace-pre-wrap shadow-[inset_2px_0_0_0_#26272c] pl-2 text-zinc-600">
              {systemPrompt}
            </pre>
          )}
        </div>
      )}
      {entries.length === 0 && !ollamaError && (
        <div className="flex min-h-[min(28rem,60vh)] items-center justify-center px-4">
          <div className="w-full max-w-md text-center">
            <div className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#17181c] text-blue-300 shadow-[0_0_0_1px_rgba(110,168,254,0.16),0_10px_26px_rgba(0,0,0,0.2)]">
              <MessageCircle size={25} strokeWidth={1.6} />
              <Sparkles
                size={13}
                className="absolute -right-1 -top-1 text-amber-300"
              />
            </div>
            <h2 className="text-lg font-medium text-zinc-100">
              What are we working on?
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Ask about your code, plan a change, or let the agent explore the
              project with you.
            </p>
          </div>
        </div>
      )}
      {ollamaError && (
        <div className="rounded-md shadow-[0_0_0_1px_rgba(127,29,29,0.5)] bg-red-950/30 px-3 py-2 text-red-300 text-xs">
          {ollamaError}
        </div>
      )}
      {acpRestoreFailed && (
        <div className="flex items-center justify-between gap-3 rounded-md shadow-[0_0_0_1px_rgba(127,29,29,0.5)] bg-red-950/30 px-3 py-2 text-red-300 text-xs">
          <span>
            This agent couldn't restore its previous session ({acpRestoreFailed}
            ). It no longer remembers this conversation.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={onRetryAcpSession}
          >
            Start new session
          </Button>
        </div>
      )}
      {claudeRateLimit && (
        <div className="flex items-center justify-between gap-3 rounded-md shadow-[0_0_0_1px_rgba(120,84,12,0.5)] bg-amber-950/30 px-3 py-2 text-amber-300 text-xs">
          <span>
            {claudeAutoResumeArmed
              ? `Claude hit its session limit. Will auto-resume at ${formatClockTime(claudeRateLimit.resetAt)}.`
              : `Claude hit its session limit (resets ${formatClockTime(claudeRateLimit.resetAt)}). Auto-resume then?`}
          </span>
          <div className="flex shrink-0 gap-2">
            {claudeAutoResumeArmed ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onDismissClaudeRateLimit}
              >
                Cancel
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onDismissClaudeRateLimit}
                >
                  No
                </Button>
                <Button size="sm" onClick={onArmClaudeAutoResume}>
                  Yes, resume automatically
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {renderItems.map((item) => {
        if (item.kind === "activitygroup") {
          const { indices } = item;
          const groupKey = String(indices[0]);
          const expanded = groupExpanded[groupKey] ?? false;
          const showToggle = indices.length > 1;
          const visible =
            showToggle && !expanded ? [indices[indices.length - 1]] : indices;
          const thoughtCount = indices.filter(
            (idx) => entries[idx].kind === "thinking",
          ).length;
          const toolCount = indices.filter(
            (idx) => entries[idx].kind === "tool",
          ).length;
          const activitySummary = [
            thoughtCount > 0 && `${thoughtCount} thoughts`,
            toolCount > 0 && `${toolCount} tools used`,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <div key={`activity-${groupKey}`} className="space-y-1.5">
              {visible.map((idx) => renderEntry(idx))}
              {showToggle && (
                <Button
                  variant="unstyled"
                  size="none"
                  onClick={() => toggleGroup(groupKey)}
                  className="flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-zinc-600 hover:text-zinc-400"
                >
                  <ChevronDown
                    size={11}
                    className={`transition-transform duration-200 ease-out ${expanded ? "rotate-180" : ""}`}
                  />
                  {expanded ? "Hide" : `Show all (${activitySummary})`}
                </Button>
              )}
            </div>
          );
        }
        return renderEntry(item.index);
      })}
      {sending && (
        <div className="text-sm">
          {hasActivity && replyStartedAt ? (
            <span className="shine-text">
              {`Working for ${formatDuration(Math.max(0, Math.round((nowTick - replyStartedAt) / 1000)))}`}
            </span>
          ) : (
            <span className="shine-text">Waiting</span>
          )}
        </div>
      )}
    </div>
  );
}
