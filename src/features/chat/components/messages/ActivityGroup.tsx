import { ChatToolCalls } from "@astryxdesign/core/Chat";
import type { PanelEntry } from "../../hooks/useChatStream";
import { activitySummary, toolCallFor } from "./toolCalls";

interface ActivityGroupProps {
  entries: PanelEntry[];
  /** Indices into `entries` of this run of consecutive thinking/tool entries. */
  indices: number[];
}

// A run of consecutive thinking/tool entries as one Astryx `ChatToolCalls`:
// a single entry is one row; more collapse to just the latest one plus a
// count, and expand to every row under "N thoughts, M tools used" (what the
// old "Show all (…)" toggle did). `ChatToolCalls` owns the expanded state;
// its parent keys it on the run's first index, which stays stable as long
// as `entries` only ever grows (it does).
export default function ActivityGroup({
  entries,
  indices,
}: ActivityGroupProps) {
  const last = entries.length - 1;
  const calls = indices.flatMap((i) => {
    const call = toolCallFor(entries[i], i, i === last);
    return call ? [call] : [];
  });
  return (
    <ChatToolCalls calls={calls} label={activitySummary(entries, indices)} />
  );
}
