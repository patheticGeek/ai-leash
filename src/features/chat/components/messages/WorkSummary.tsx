import { ChatToolCalls } from "@astryxdesign/core/Chat";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import { formatDuration } from "@/lib/format";
import type { PanelEntry } from "../../hooks/useChatStream";
import { activitySummary } from "./toolCalls";
import { turnInset } from "./turnInset";

interface WorkSummaryProps {
  entries: PanelEntry[];
  /** Indices into `entries` of the finished turn's work, before its final reply. */
  indices: number[];
  /** How long the turn took, if known (older history may not have it). */
  turnDuration: number | undefined;
  /** Renders the work itself once expanded, grouped as usual. */
  children: ReactNode;
}

// A finished turn's thinking, tool calls and intermediate text, folded into
// one "Worked for <time> · 1 thought, 4 tools used" `ChatToolCalls` row so
// the transcript shows just the user's message and the reply's closing text
// (its summary/result). Its detail is the work itself, grouped as it was
// while running (`ActivityGroup`s and intermediate replies). The row owns
// its open state; its parent keys it on the work's first index, which
// stays stable as long as `entries` only ever grows (it does).
export default function WorkSummary({
  entries,
  indices,
  turnDuration,
  children,
}: WorkSummaryProps) {
  const summary = activitySummary(entries, indices);
  return (
    <ChatToolCalls
      xstyle={turnInset.inset}
      calls={[
        {
          key: `work-${indices[0]}`,
          name:
            turnDuration !== undefined
              ? `Worked for ${formatDuration(turnDuration)}`
              : "Worked",
          target: summary || undefined,
          status: "complete",
          resultDetail: (
            <VStack gap={1.5} width="100%">
              {children}
            </VStack>
          ),
        },
      ]}
    />
  );
}
