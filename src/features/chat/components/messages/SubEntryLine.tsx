import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Entry, isToolError } from "../../../../lib/chatEntries";
import Markdown from "../../../../ui/Markdown";
import SectionLabel from "./SectionLabel";

// Nested rendering for a sub-agent's own transcript, shown inside its
// parent `spawn_sub_agent` tool-call entry once expanded — deliberately
// smaller/plainer than the top-level rendering below (no expand/collapse,
// no copy button, no timing), since it's read-only context for the parent
// turn rather than its own interactive conversation.
export default function SubEntryLine({ entry }: { entry: Entry }) {
  if (entry.kind === "text") {
    return (
      <div
        className={cn(
          "select-text",
          entry.role === "user" ? "text-zinc-400" : "text-zinc-500",
        )}
      >
        <SectionLabel>
          {entry.role === "user" ? "task" : "sub-agent"}
        </SectionLabel>
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
