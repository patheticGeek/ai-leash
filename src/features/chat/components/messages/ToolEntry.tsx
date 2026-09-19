import { Bot, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { isToolError } from "../../../../lib/chatEntries";
import type { PanelEntry } from "../../hooks/useChatStream";
import { ActivityRow } from "./ActivityRow";
import SectionLabel from "./SectionLabel";
import SubEntryLine from "./SubEntryLine";

// A tool call in the transcript: a collapsible row that expands to its
// input, any sub-agent transcripts it spawned (nested, read-only, via
// `SubEntryLine`) and its output — red when the result is an error, "running…"
// until one arrives.
export default function ToolEntry({
  entry,
  expanded,
  onToggleExpand,
}: {
  entry: Extract<PanelEntry, { kind: "tool" }>;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
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
        <SectionLabel className="mb-0.5">input</SectionLabel>
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
              <SectionLabel className="mb-0.5">{t.description}</SectionLabel>
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
          <SectionLabel tone={failed ? "error" : "default"} className="mb-0.5">
            output
          </SectionLabel>
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
