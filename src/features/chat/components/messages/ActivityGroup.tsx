import { Button } from "@astryxdesign/core/Button";
import { ChatToolCalls } from "@astryxdesign/core/Chat";
import { Icon } from "@astryxdesign/core/Icon";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { PanelEntry } from "../../hooks/useChatStream";
import { toolCallFor } from "./toolCalls";
import { turnInset } from "./turnInset";

const styles = stylex.create({
  // The rows stack like `ChatToolCalls`' own expanded list: no gap between
  // rows, and the group keeps the one row's --spacing-2 above it.
  group: { marginBlockStart: spacingVars["--spacing-2"] },
  row: { marginBlockStart: 0 },
  toggle: { alignSelf: "flex-start" },
});

interface ActivityGroupProps {
  entries: PanelEntry[];
  /** Indices into `entries` of this run of consecutive thinking/tool entries. */
  indices: number[];
}

// A run of consecutive thinking/tool entries (`groupActivity`): one
// `ChatToolCalls` row per step, collapsed to just the latest step, with a
// "Show N more" button under it that lists the earlier ones above it and
// turns into "Show less". It never opens on its own, even while the run is
// still growing. A one-step run is just its row. The rows and the button sit
// on the turn's left edge (`turnInset`). Its parent keys it on the run's
// first index, which stays stable as long as `entries` only ever grows (it
// does), so the expanded state can live here.
export default function ActivityGroup({
  entries,
  indices,
}: ActivityGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const last = entries.length - 1;
  const hidden = indices.length - 1;
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
          />
        </VStack>
      )}
    </VStack>
  );
}
