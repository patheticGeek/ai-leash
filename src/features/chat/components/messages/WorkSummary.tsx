import { ChatToolCalls } from "@astryxdesign/core/Chat";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { formatDuration } from "@/lib/format";
import type { PanelEntry } from "../../hooks/useChatStream";
import { activitySummary } from "./toolCalls";
import { turnInset } from "./turnInset";

const styles = stylex.create({
  // The row's detail is indented past its status icon to its name; the
  // steps inside then take the turn's own inset (`turnInset`) on top. Pull
  // the steps back by that inset so their icons (and the text of any reply
  // inside) start at the "Worked for" label: nested, without doubling up.
  steps: {
    marginInlineStart: `calc(-1 * ${spacingVars["--spacing-4"]})`,
    width: `calc(100% + ${spacingVars["--spacing-4"]})`,
  },
});

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
            <VStack gap={1.5} xstyle={styles.steps}>
              {children}
            </VStack>
          ),
        },
      ]}
    />
  );
}
