import {
  Bot,
  Check,
  ChevronRight,
  Copy,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { Button } from "@/ui/button";
import { type Entry, isToolError } from "../../../lib/chatEntries";
import Markdown from "../../../ui/Markdown";
import type { PanelEntry } from "../hooks/useChatStream";

export function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <ChevronRight
      size={12}
      className={`shrink-0 text-zinc-600 transition-transform duration-200 ease-out ${expanded ? "rotate-90" : ""}`}
    />
  );
}

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
        className={`select-text ${entry.role === "user" ? "text-zinc-400" : "text-zinc-500"}`}
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
        {entry.done ? "thought" : "thinking…"}
      </div>
    );
  }
  const failed = isToolError(entry.result);
  return (
    <div
      className={`rounded-md px-2 py-1 ${
        failed
          ? "shadow-[0_0_0_1px_rgba(127,29,29,0.5)] bg-red-950/20 text-red-300"
          : "shadow-[var(--al-shadow)] bg-[#101114] text-zinc-500"
      }`}
    >
      <Wrench
        size={11}
        className={`inline-block -mt-0.5 mr-1 ${failed ? "text-red-400" : "text-zinc-700"}`}
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
}

// Renders one transcript entry ("info"/"text"/"thinking"/"tool") — the
// counterpart to `ChatEntryList.tsx`'s grouping/iteration over the whole
// array. `SubAgentChatTab.tsx` renders the same `Entry` union but keeps its
// own, deliberately simpler `EntryBlock` rather than this component — see
// that file's top-of-file note for why the two weren't unified.
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
}: ChatEntryRendererProps) {
  if (entry.kind === "info") {
    return (
      <div className="select-text rounded-md shadow-[var(--al-shadow)] bg-[#17181c] px-3 py-2 text-xs text-zinc-400">
        <Markdown content={entry.content} />
      </div>
    );
  }

  if (entry.kind === "text") {
    const isUser = entry.role === "user";
    return (
      <div
        className={`group flex flex-col ${isUser ? "items-end text-zinc-200" : "items-start text-zinc-300"}`}
      >
        <div
          className={`select-text ${
            isUser ? "rounded-2xl px-3 py-2 bg-zinc-900 max-w-4/5" : undefined
          }`}
        >
          <Markdown content={entry.content} />
        </div>

        <div
          className={`mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out w-full flex items-center gap-2 mb-0.5 text-xs uppercase tracking-wide text-zinc-600 ${isUser ? "flex-row-reverse" : ""}`}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCopy}
            title="Copy"
            className="text-zinc-600 hover:text-zinc-300"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </Button>
          {!sending && isLast && !isAcp && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRetry}
              title="Retry"
              className="text-zinc-600 hover:text-zinc-300"
            >
              <RotateCcw size={13} />
            </Button>
          )}
          <span className="normal-case tracking-normal text-zinc-700">
            {!isUser && turnDuration !== undefined
              ? `${formatTime(entry.time)} · Worked for ${formatDuration(turnDuration)}`
              : formatTime(entry.time)}
          </span>
        </div>
      </div>
    );
  }

  if (entry.kind === "thinking") {
    return (
      <div className="text-xs">
        <Button
          variant="unstyled"
          size="none"
          onClick={onToggleExpand}
          className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-zinc-600 hover:text-zinc-400"
        >
          <Chevron expanded={expanded} />
          <span className="italic">thinking…</span>
        </Button>
        {expanded && (
          <div className="mt-1 ml-4 whitespace-pre-wrap shadow-[inset_2px_0_0_0_#26272c] pl-2 italic text-zinc-600">
            {entry.content}
          </div>
        )}
      </div>
    );
  }

  // entry.kind === "tool"
  const failed = isToolError(entry.result);
  return (
    <div
      className={`rounded-md text-xs ${
        failed
          ? "shadow-[0_0_0_1px_rgba(127,29,29,0.5)] bg-red-950/10"
          : "shadow-[var(--al-shadow)] bg-[#141518]"
      }`}
    >
      <Button
        variant="unstyled"
        size="none"
        onClick={onToggleExpand}
        className="px-2.5 py-1.5 flex w-full min-w-0 items-center gap-1.5 rounded-md text-left text-zinc-400 hover:bg-white/5"
      >
        <Chevron expanded={expanded} />
        {entry.name === "spawn_sub_agent" ||
        entry.name === "sub_agent_result" ? (
          <Bot
            size={12}
            className={`shrink-0 ${failed ? "text-red-400" : "text-zinc-600"}`}
          />
        ) : (
          <Wrench
            size={12}
            className={`shrink-0 ${failed ? "text-red-400" : "text-zinc-600"}`}
          />
        )}
        <span className="shrink-0">{entry.name}</span>
        <span className="select-text min-w-0 flex-1 truncate text-zinc-600">
          {!expanded ? JSON.stringify(entry.args) : ""}
        </span>
        {entry.result === undefined && (
          <span className="shrink-0 text-zinc-600">running…</span>
        )}
        {failed && <span className="shrink-0 text-red-400">failed</span>}
      </Button>
      {expanded && (
        <div className="mt-1 pl-4">
          <pre className="select-text max-h-40 overflow-auto whitespace-pre-wrap text-zinc-600">
            {JSON.stringify(entry.args, null, 2)}
          </pre>
          {entry.subtasks && entry.subtasks.length > 0 && (
            <div className="mt-1.5 space-y-2">
              {entry.subtasks.map((t) => (
                <div
                  key={t.subSessionId}
                  className="shadow-[inset_2px_0_0_0_#26272c] pl-2"
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
            <pre
              className={`select-text mt-1 max-h-40 overflow-auto whitespace-pre-wrap ${
                failed ? "text-red-300" : "text-zinc-500"
              }`}
            >
              {entry.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
