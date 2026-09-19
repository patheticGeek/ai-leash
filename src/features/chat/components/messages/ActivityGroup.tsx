import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import type { PanelEntry } from "../../hooks/useChatStream";

interface ActivityGroupProps {
  entries: PanelEntry[];
  /** Indices into `entries` of this run of consecutive thinking/tool entries. */
  indices: number[];
  renderEntry: (index: number) => ReactNode;
}

// A run of consecutive thinking/tool entries, collapsed to just the latest
// one by default behind a "Show all (N thoughts, M tools used)" toggle. Its
// parent keys it on the run's first index, which stays stable as long as
// `entries` only ever grows (it does), so the expanded state can live here.
export default function ActivityGroup({
  entries,
  indices,
  renderEntry,
}: ActivityGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const showToggle = indices.length > 1;
  const visible =
    showToggle && !expanded ? [indices[indices.length - 1]] : indices;
  const thoughtCount = indices.filter(
    (idx) => entries[idx].kind === "thinking",
  ).length;
  const toolCount = indices.filter(
    (idx) => entries[idx].kind === "tool",
  ).length;
  const summary = [
    thoughtCount > 0 && `${thoughtCount} thoughts`,
    toolCount > 0 && `${toolCount} tools used`,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <>
      {visible.map((idx) => renderEntry(idx))}
      {showToggle && (
        <Button
          variant="quiet"
          size="xs"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md"
        >
          <ChevronDown
            size={11}
            className={cn(
              "transition-transform duration-200 ease-out",
              expanded ? "rotate-180" : "",
            )}
          />
          {expanded ? "Hide" : `Show all (${summary})`}
        </Button>
      )}
    </>
  );
}
