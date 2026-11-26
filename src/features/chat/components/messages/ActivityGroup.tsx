import { Button } from "@astryxdesign/core/Button";
import { ChatToolCalls } from "@astryxdesign/core/Chat";
import { Icon } from "@astryxdesign/core/Icon";
import {
  colorVars,
  spacingVars,
  typeScaleVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ChevronUp } from "lucide-react";
import { memo, useState } from "react";
import { hiddenSteps } from "../../entryGrouping";
import type { PanelEntry } from "../../hooks/useChatStream";
import { toolCallFor } from "./toolCalls";
import { turnInset } from "./turnInset";

const styles = stylex.create({
  // The rows stack like `ChatToolCalls`' own expanded list: no gap between
  // rows, and the group keeps the one row's --spacing-2 above it.
  // Stretched to the message column (which aligns its children to the
  // start): sized to its content instead, a row's `ChatToolCalls` cap
  // (`maxWidth: 100%`) would be a share of this stack, so a long terminal
  // or action line widened both and ran past the column's edge.
  group: {
    marginBlockStart: spacingVars["--spacing-2"],
    alignSelf: "stretch",
    minWidth: 0,
  },
  row: { marginBlockStart: 0 },
  toggle: { alignSelf: "flex-start" },
  // Muted like the sidebar's "More projects"/"Show all" (`showMore` in
  // `LeftBar.tsx`): secondary text, primary on hover, supporting size.
  showMore: {
    color: {
      default: colorVars["--color-text-secondary"],
      ":hover": colorVars["--color-text-primary"],
    },
    fontSize: typeScaleVars["--text-supporting-size"],
  },
});

interface ActivityGroupProps {
  entries: PanelEntry[];
  /** Indices into `entries` of this run of consecutive thinking/tool entries. */
  indices: number[];
}

// A run of consecutive thinking/tool entries (`groupActivity`): one
// `ChatToolCalls` row per step. A run of `GROUP_MIN` or more is collapsed to
// just the latest step, with a muted "Show N more" button under it that
// lists the earlier ones above it and turns into "Show less"; a shorter run
// shows all its rows and no button (`hiddenSteps`). It never opens on its
// own, even while the run is still growing. The rows and the button sit on
// the turn's left edge (`turnInset`). Its parent keys it on the run's first
// index, which stays stable as long as `entries` only ever grows (it does),
// so the expanded state can live here.
function ActivityGroup({ entries, indices }: ActivityGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const last = entries.length - 1;
  const hidden = hiddenSteps(indices.length);
  const visible = hidden > 0 && !isExpanded ? indices.slice(-1) : indices;
  return (
    <VStack xstyle={styles.group}>
      {visible.map((i) => {
        const call = toolCallFor(entries[i], i, i === last);
        return call ? (
          <ChatToolCalls
            key={i}
            calls={[call]}
            xstyle={[turnInset.inset, styles.row]}
          />
        ) : null;
      })}
      {hidden > 0 && (
        <VStack xstyle={[turnInset.inset, styles.toggle]}>
          <Button
            variant="ghost"
            size="sm"
            label={isExpanded ? "Show less" : `Show ${hidden} more`}
            aria-expanded={isExpanded}
            endContent={
              <Icon icon={isExpanded ? ChevronUp : ChevronDown} size="sm" />
            }
            onClick={() => setIsExpanded((v) => !v)}
            xstyle={styles.showMore}
          />
        </VStack>
      )}
    </VStack>
  );
}

// It gets the whole `entries` array, which is a new one on every streamed
// chunk: re-render only when one of its own entries (or whether its last one
// ends the transcript, which decides "Thinking…") actually changed.
function sameRun(prev: ActivityGroupProps, next: ActivityGroupProps) {
  if (prev.indices.length !== next.indices.length) return false;
  const lastIndex = next.indices[next.indices.length - 1];
  if (
    (lastIndex === prev.entries.length - 1) !==
    (lastIndex === next.entries.length - 1)
  ) {
    return false;
  }
  return next.indices.every(
    (i, n) => prev.indices[n] === i && prev.entries[i] === next.entries[i],
  );
}

export default memo(ActivityGroup, sameRun);
