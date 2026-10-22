import type { ReactNode } from "react";
import { useState } from "react";
import { formatDuration } from "@/lib/format";
import type { PanelEntry } from "../../hooks/useChatStream";
import { ActivityRow } from "./ActivityRow";

interface WorkSummaryProps {
  entries: PanelEntry[];
  /** Indices into `entries` of the finished turn's work, before its final reply. */
  indices: number[];
  /** How long the turn took, if known (older history may not have it). */
  turnDuration: number | undefined;
  /** Renders the work itself once expanded, grouped as usual. */
  children: ReactNode;
}

// A finished turn's thinking, tool calls and intermediate text, collapsed
// into one "Worked for <time>" row so the transcript shows just the user's
// message and the reply's closing text (its summary/result). Its parent keys
// it on the work's first index, which stays stable as long as `entries`
// only ever grows (it does), so the expanded state can live here.
export default function WorkSummary({
  entries,
  indices,
  turnDuration,
  children,
}: WorkSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const count = (kind: PanelEntry["kind"]) =>
    indices.filter((i) => entries[i].kind === kind).length;
  const thoughtCount = count("thinking");
  const toolCount = count("tool");
  const messageCount = count("text");
  const summary = [
    thoughtCount > 0 && `${thoughtCount} thoughts`,
    toolCount > 0 && `${toolCount} tools used`,
    messageCount > 0 && `${messageCount} messages`,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <ActivityRow
      label={
        turnDuration !== undefined
          ? `Worked for ${formatDuration(turnDuration)}`
          : "Worked"
      }
      summary={summary}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    >
      <div className="space-y-3 text-sm">{children}</div>
    </ActivityRow>
  );
}
