import { cn } from "@/lib/utils";
import Markdown from "../../../../ui/Markdown";
import type { PanelEntry } from "../../hooks/useChatStream";
import { ActivityRow } from "./ActivityRow";
import MessageFooter from "./MessageFooter";
import ToolEntry from "./ToolEntry";

export interface ChatEntryRendererProps {
  entry: PanelEntry;
  isLast: boolean;
  sending: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  copied: boolean;
  onCopy: () => void;
  onRetry: () => void;
  turnDuration: number | undefined;
  showFooter: boolean;
  // Whether the last reply's footer may show a Retry button at all — false
  // when the backend can't re-run a turn (`caps.retry`, e.g. an ACP agent)
  // or the transcript has no "send this again" of its own (e.g.
  // `SubAgentChatTab.tsx`), where the button would be a dead control.
  allowRetry: boolean;
}

// Renders one transcript entry ("info"/"text"/"thinking"/"tool") — the
// counterpart to `ChatEntryList.tsx`'s iteration over the whole array
// (grouping lives in `entryGrouping.ts`). Also reused as-is by
// `SubAgentChatTab.tsx` (via `ChatEntryList`) so a sub-agent's own transcript
// shows tool calls/thinking identically to a top-level conversation's, just
// with `allowRetry` forced off and no system-prompt/provider-error/ACP-restore
// banners.
export default function ChatEntryRenderer({
  entry,
  isLast,
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
            showRetry={!sending && isLast && allowRetry}
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

  return (
    <ToolEntry
      entry={entry}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    />
  );
}
