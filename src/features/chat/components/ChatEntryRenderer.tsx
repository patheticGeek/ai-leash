import { Bot, Check, Copy, RotateCcw, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Marker } from "@/ui/marker";
import { type Entry, isToolError } from "../../../lib/chatEntries";
import Markdown from "../../../ui/Markdown";
import type { PanelEntry } from "../hooks/useChatStream";

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// Nested rendering for a sub-agent's own transcript, shown inside its
// parent `spawn_sub_agent` tool-call entry once expanded — deliberately
// smaller/plainer than the top-level rendering below (no expand/collapse,
// no copy button, no timing), since it's read-only context for the parent
// turn rather than its own interactive conversation.
function SubEntryLine({ entry }: { entry: Entry }) {
  if (entry.kind === "text") {
    return (
      <div
        className={cn(
          "select-text",
          entry.role === "user" ? "text-zinc-400" : "text-zinc-500",
        )}
      >
        <div className="text-[9px] uppercase tracking-wide text-zinc-700">
          {entry.role === "user" ? "task" : "sub-agent"}
        </div>
        {entry.role === "user" ? (
          <div className="whitespace-pre-wrap">{entry.content}</div>
        ) : (
          <Markdown content={entry.content} />
        )}
      </div>
    );
  }
  if (entry.kind === "thinking") {
    return (
      <div className="italic text-zinc-700">
        {entry.done ? "Thought" : "Thinking…"}
      </div>
    );
  }
  const failed = isToolError(entry.result);
  return (
    <div
      className={cn(
        "rounded-md px-2 py-1",
        failed
          ? "shadow-[0_0_0_1px_rgba(127,29,29,0.5)] bg-red-950/20 text-red-300"
          : "bg-raised text-zinc-500",
      )}
    >
      <Wrench
        size={11}
        className={cn(
          "inline-block -mt-0.5 mr-1",
          failed ? "text-red-400" : "text-zinc-700",
        )}
      />
      {entry.name}
      {failed && <span className="text-red-400"> · failed</span>}
      {entry.result === undefined ? (
        <span className="text-zinc-700"> · running…</span>
      ) : (
        <div className="mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap opacity-90">
          {entry.result}
        </div>
      )}
    </div>
  );
}

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
// counterpart to `ChatEntryList.tsx`'s grouping/iteration over the whole
// array. Also reused as-is by `SubAgentChatTab.tsx` (via `ChatEntryList`) so
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
          <div
            className={cn(
              "mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out w-full flex items-center gap-2 mb-0.5 text-xs uppercase tracking-wide text-zinc-600",
              isUser ? "flex-row-reverse" : "",
            )}
          >
            <Button
              variant="quiet"
              size="icon-sm"
              onClick={onCopy}
              title="Copy"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </Button>
            {!sending && isLast && !isAcp && allowRetry && (
              <Button
                variant="quiet"
                size="icon-sm"
                onClick={onRetry}
                title="Retry"
              >
                <RotateCcw size={13} />
              </Button>
            )}
            <div className="normal-case tracking-normal text-zinc-700 gap-2 flex items-center">
              <span>{formatTime(entry.time)}</span>
              {!isUser && turnDuration !== undefined && (
                <>
                  <span>·</span>
                  <span className="normal-case tracking-normal text-zinc-700">
                    Worked for {formatDuration(turnDuration)}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (entry.kind === "thinking") {
    const thinking = !entry.done && isLast;
    return (
      <Marker
        italic
        shine={thinking}
        label={thinking ? "Thinking…" : "Thought"}
        expanded={expanded}
        onToggle={onToggleExpand}
      >
        <div className="whitespace-pre-wrap italic">{entry.content}</div>
      </Marker>
    );
  }

  // entry.kind === "tool"
  const failed = isToolError(entry.result);
  const Icon =
    entry.name === "spawn_sub_agent" || entry.name === "sub_agent_result"
      ? Bot
      : Wrench;
  return (
    <Marker
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
    </Marker>
  );
}
