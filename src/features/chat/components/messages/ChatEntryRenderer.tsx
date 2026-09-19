import { Bot, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { isToolError } from "../../../../lib/chatEntries";
import Markdown from "../../../../ui/Markdown";
import type { PanelEntry } from "../../hooks/useChatStream";
import { ActivityRow } from "./ActivityRow";
import MessageFooter from "./MessageFooter";
import SubEntryLine from "./SubEntryLine";

export interface ChatEntryRendererProps {
  entry: PanelEntry;
  isLast: boolean;
  isAcp: boolean;
  sending: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  copied: boolean;
  onCopy: () => void;
  onRetry: () => void;
  turnDuration: number | undefined;
  showFooter: boolean;
  // Whether the last reply's footer may show a Retry button at all — false
  // for a transcript with no real "send this again" concept of its own
  // (e.g. `SubAgentChatTab.tsx`, which has no `retry_last` equivalent, so
  // showing the button would just be a dead control). Independent of
  // `isAcp`, which already suppresses it for a different reason (an ACP
  // agent's own turn can't be resent through the native retry path either).
  allowRetry: boolean;
}

// Renders one transcript entry ("info"/"text"/"thinking"/"tool") — the
// counterpart to `ChatEntryList.tsx`'s iteration over the whole array
// (grouping lives in `entryGrouping.ts`). Also reused as-is by `SubAgentChatTab.tsx` (via `ChatEntryList`) so
// a sub-agent's own transcript shows tool calls/thinking identically to a
// top-level conversation's, just with `allowRetry`/`isAcp` forced off and no
// system-prompt/Ollama/ACP-restore banners.
export default function ChatEntryRenderer({
  entry,
  isLast,
  isAcp,
  sending,
  expanded,
  onToggleExpand,
  copied,
  onCopy,
  onRetry,
  turnDuration,
  showFooter,
  allowRetry,
}: ChatEntryRendererProps) {
  if (entry.kind === "info") {
    return (
      <div className="select-text rounded-md bg-raised px-3 py-2 text-xs text-zinc-400">
        <Markdown content={entry.content} />
      </div>
    );
  }

  if (entry.kind === "text") {
    const isUser = entry.role === "user";
    return (
      <div
        className={cn(
          "group flex flex-col",
          isUser ? "items-end text-zinc-200" : "items-start text-zinc-300",
        )}
      >
        <div
          className={cn(
            "select-text",
            isUser
              ? "rounded-2xl px-3 py-2 bg-raised max-w-4/5"
              : "min-w-0 max-w-full",
          )}
        >
          <Markdown content={entry.content} />
        </div>

        {showFooter && (
          <MessageFooter
            isUser={isUser}
            time={entry.time}
            copied={copied}
            onCopy={onCopy}
            showRetry={!sending && isLast && !isAcp && allowRetry}
            onRetry={onRetry}
            turnDuration={isUser ? undefined : turnDuration}
          />
        )}
      </div>
    );
  }

  if (entry.kind === "thinking") {
    const thinking = !entry.done && isLast;
    return (
      <ActivityRow
        italic
        shine={thinking}
        label={thinking ? "Thinking…" : "Thought"}
        expanded={expanded}
        onToggle={onToggleExpand}
      >
        <div className="whitespace-pre-wrap italic">{entry.content}</div>
      </ActivityRow>
    );
  }

  // entry.kind === "tool"
  const failed = isToolError(entry.result);
  const Icon =
    entry.name === "spawn_sub_agent" || entry.name === "sub_agent_result"
      ? Bot
      : Wrench;
  return (
    <ActivityRow
      fullWidth
      icon={<Icon />}
      label={entry.name}
      summary={JSON.stringify(entry.args)}
      status={
        failed ? "failed" : entry.result === undefined ? "running" : undefined
      }
      expanded={expanded}
      onToggle={onToggleExpand}
    >
      <div>
        <div className="mb-0.5 text-[9px] uppercase tracking-wide text-zinc-700">
          input
        </div>
        <pre className="select-text max-h-40 overflow-auto whitespace-pre-wrap">
          {JSON.stringify(entry.args, null, 2)}
        </pre>
      </div>
      {entry.subtasks && entry.subtasks.length > 0 && (
        <div className="space-y-2">
          {entry.subtasks.map((t) => (
            <div
              key={t.subSessionId}
              className="shadow-[inset_2px_0_0_0_var(--border)] pl-2"
            >
              <div className="mb-0.5 text-[9px] uppercase tracking-wide text-zinc-700">
                {t.description}
              </div>
              <div className="space-y-1.5">
                {t.entries.map((sub, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: entries are append-only, never reordered/filtered, and carry no stable id
                  <SubEntryLine key={j} entry={sub} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {entry.result !== undefined && (
        <div>
          <div
            className={cn(
              "mb-0.5 text-[9px] uppercase tracking-wide",
              failed ? "text-red-400" : "text-zinc-700",
            )}
          >
            output
          </div>
          <pre
            className={cn(
              "select-text max-h-40 overflow-auto whitespace-pre-wrap",
              failed ? "text-red-300" : "text-zinc-500",
            )}
          >
            {entry.result}
          </pre>
        </div>
      )}
    </ActivityRow>
  );
}
