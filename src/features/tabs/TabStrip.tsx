import { Badge } from "@astryxdesign/core/Badge";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { useSubAgents } from "@/data/subAgents";
import { cn } from "@/lib/utils";
import { useGenerating } from "../../lib/generatingQuery";
import { useAppStore, type WorkspaceTab } from "../../store";
import { SortableTab } from "./TabDnd";

const styles = stylex.create({
  // Lets the strip shrink below its tabs' width and scroll instead.
  strip: {
    minWidth: 0,
    flexGrow: 1,
  },
  // Room at the tab's end for the close button laid over it.
  closable: {
    paddingInlineEnd: spacingVars["--spacing-7"],
  },
});

// Tab labels are single-line; cap very long ones (file paths, sub-agent
// descriptions) so one tab can't take the whole strip.
const MAX_LABEL = 32;
const clip = (label: string) =>
  label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;

// The tab row of either area — every tab kind can sit in either one, so
// each tab's decorations (running shine, sub-agent count, unsaved marker)
// follow its kind, not the strip it's in.
export default function TabStrip({
  tabs,
  value,
  onSelect,
  className,
}: {
  tabs: WorkspaceTab[];
  /** The selected tab id ("" for none). */
  value: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const closeTab = useAppStore((s) => s.closeTab);
  const openFiles = useAppStore((s) => s.openFiles);
  // Scoped to the active conversation — otherwise this would count another
  // conversation's still-running sub-agents too, once more than one has
  // ever been loaded into memory this session.
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  // Backend-driven per-session activity — the primary tab is covered by the
  // always-mounted `useGeneratingListener` (`App.tsx`), `useSubAgents`
  // covers sub-agent tabs (no `generating` event of its own; `status` is
  // already tracked for the Sub Agents tab).
  const primaryGenerating = useGenerating(activeSessionId ?? "").active;
  const subAgentTasks = useSubAgents(activeSessionId);
  const runningSubAgents = subAgentTasks.filter(
    (t) => t.status === "running",
  ).length;

  return (
    <HStack className={cn("min-w-0", className)} align="center">
      <TabList
        value={value}
        onChange={onSelect}
        size="sm"
        xstyle={styles.strip}
      >
        <SortableContext
          items={tabs.map((t) => t.id)}
          strategy={horizontalListSortingStrategy}
        >
          {tabs.map((tab) => {
            const running =
              tab.kind === "primary"
                ? primaryGenerating
                : tab.kind === "subagent" &&
                  subAgentTasks.find((t) => t.subSessionId === tab.subSessionId)
                    ?.status === "running";
            // Only shine while this tab isn't the one you're already looking
            // at — the active tab's own content already shows its running
            // state (the "Working for…"/"Waiting" indicator).
            const shine = running && tab.id !== value;
            const dirty =
              tab.kind === "file" &&
              !!openFiles.find((f) => f.path === tab.path)?.dirty;
            const closable = tab.kind !== "primary";
            return (
              <SortableTab key={tab.id} id={tab.id}>
                <Tab
                  value={tab.id}
                  label={clip(tab.label)}
                  className={shine ? "shine-text" : undefined}
                  xstyle={closable && styles.closable}
                  endContent={
                    tab.kind === "subagents" && runningSubAgents > 0 ? (
                      <Badge variant="info" label={runningSubAgents} />
                    ) : dirty ? (
                      <StatusDot variant="neutral" label="Unsaved changes" />
                    ) : undefined
                  }
                />
                {closable && (
                  // A sibling of the tab, not inside it — a button can't
                  // contain a button.
                  <IconButton
                    variant="quiet"
                    size="sm"
                    label="Close tab"
                    tooltip="Close tab"
                    icon={<X size={12} />}
                    onClick={() => closeTab(tab.id)}
                    className="absolute inset-y-0 right-0.5 my-auto size-6"
                  />
                )}
              </SortableTab>
            );
          })}
        </SortableContext>
      </TabList>
    </HStack>
  );
}
