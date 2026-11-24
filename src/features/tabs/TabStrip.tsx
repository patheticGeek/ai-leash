import { Badge } from "@astryxdesign/core/Badge";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { StackItem } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import type { StyleXStyles } from "@stylexjs/stylex";
import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useSubAgents } from "@/data/subAgents";
import { useGenerating } from "../../lib/generatingQuery";
import { useAppStore, type WorkspaceTab } from "../../store";
import { useSortableTab } from "./TabDnd";

// The highlight sits mid-image and the image is 3x the text's width, so at
// both ends of the sweep the text only sees flat dim text — the loop restarts
// seamlessly instead of jumping. No-repeat keeps a second tile from showing
// the highlight again at the end.
const shineSweep = stylex.keyframes({
  from: { backgroundPosition: "100% 0" },
  to: { backgroundPosition: "0% 0" },
});
const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";
const DIM = colorVars["--color-text-disabled"];
const BRIGHT = colorVars["--color-text-primary"];

const styles = stylex.create({
  // Lets the strip shrink below its tabs' width and scroll instead.
  strip: { minWidth: 0 },
  // Keeps the ×'s box while it's hidden, so tabs don't shift when it shows.
  hidden: { visibility: "hidden" },
  dragging: { opacity: 0.4 },
  // A running tab's label until it's opened: a light sweeping across it.
  shining: {
    backgroundImage: `linear-gradient(100deg, ${DIM} 40%, ${BRIGHT} 50%, ${DIM} 60%)`,
    backgroundSize: "300% 100%",
    backgroundRepeat: "no-repeat",
    backgroundPosition: { default: "100% 0", [REDUCED_MOTION]: "50% 0" },
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    animationName: { default: shineSweep, [REDUCED_MOTION]: "none" },
    animationDuration: "2.2s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
});

// Tab labels are single-line; cap very long ones (file paths, sub-agent
// descriptions) so one tab can't take the whole strip.
const MAX_LABEL = 32;
const clip = (label: string) =>
  label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;

// The pane's home tabs, which can't be closed: the Agent tab and the file
// tree.
const isClosable = (tab: WorkspaceTab) =>
  tab.kind !== "primary" && tab.kind !== "filetree";

// One tab of the strip. A Tab is a <button>, so a close IconButton can't go
// in its endContent (a button inside a button is invalid), and putting one
// beside the tab breaks the hover pill and the selected underline. So the ×
// is part of the tab, like a browser tab: a plain icon in endContent, shown
// on the selected tab and on hover / keyboard focus. Clicking the × closes
// the tab (the Tab's onClick sees the click landed on it, and stops the
// selection); so does middle-click anywhere on the tab, and Ctrl+W on a
// focused tab — the keyboard path, announced through aria-keyshortcuts.
function StripTab({
  tab,
  isSelected,
  isShining,
  status,
  onClose,
}: {
  tab: WorkspaceTab;
  isSelected: boolean;
  isShining: boolean;
  /** Passive status before the ×: a running count or an unsaved marker. */
  status?: ReactNode;
  onClose?: () => void;
}) {
  const [isHot, setIsHot] = useState(false);
  const { isDragging, ...sortable } = useSortableTab(tab.id);
  const close = onClose && (
    <HStack
      as="span"
      data-tab-close=""
      aria-hidden
      xstyle={isSelected || isHot ? undefined : styles.hidden}
    >
      <Icon icon={X} size="sm" color="secondary" />
    </HStack>
  );
  return (
    <Tab
      {...sortable}
      value={tab.id}
      label={clip(tab.label)}
      xstyle={[isShining && styles.shining, isDragging && styles.dragging]}
      endContent={
        status || close ? (
          <HStack as="span" align="center" gap={1}>
            {status}
            {close}
          </HStack>
        ) : undefined
      }
      {...(onClose && {
        "aria-keyshortcuts": "Control+W",
        onPointerEnter: () => setIsHot(true),
        onPointerLeave: () => setIsHot(false),
        onFocus: () => setIsHot(true),
        onBlur: () => setIsHot(false),
        onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
          if ((e.target as HTMLElement).closest("[data-tab-close]")) {
            e.preventDefault();
            onClose();
          }
        },
        // No autoscroll cursor on a middle press; the release closes.
        onMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => {
          if (e.button === 1) e.preventDefault();
        },
        onAuxClick: (e: React.MouseEvent<HTMLButtonElement>) => {
          if (e.button === 1) {
            e.preventDefault();
            onClose();
          }
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
            e.preventDefault();
            onClose();
          }
        },
      })}
    />
  );
}

// The tab row of either area — the ide template's drawer tabs, an underline
// `TabList` at size sm, the same component in both panes so their strips
// share a height and line. Every tab kind can sit in either one, so each
// tab's decorations (running shine, sub-agent count, unsaved marker) follow
// its kind, not the strip it's in. Tabs drag to reorder and between areas
// (`TabDnd.tsx`). The frame is the drawer's: spacing-2 above, the strip's
// own divider below, and an end slot (the side panel's + picker).
export default function TabStrip({
  tabs,
  value,
  onSelect,
  label,
  endContent,
  xstyle,
}: {
  tabs: WorkspaceTab[];
  /** The selected tab id ("" for none). */
  value: string;
  onSelect: (id: string) => void;
  /** Names the strip for assistive technology. */
  label: string;
  /** After the tabs, on the same line. */
  endContent?: ReactNode;
  xstyle?: StyleXStyles;
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

  const strip = (
    <TabList
      aria-label={label}
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
          const dirty =
            tab.kind === "file" &&
            !!openFiles.find((f) => f.path === tab.path)?.dirty;
          return (
            <StripTab
              key={tab.id}
              tab={tab}
              isSelected={tab.id === value}
              // Only shine while this tab isn't the one you're already
              // looking at — the active tab's own content already shows its
              // running state (the "Working for…"/"Waiting" indicator).
              isShining={!!running && tab.id !== value}
              status={
                tab.kind === "subagents" && runningSubAgents > 0 ? (
                  <Badge variant="info" label={runningSubAgents} />
                ) : dirty ? (
                  <StatusDot variant="neutral" label="Unsaved changes" />
                ) : undefined
              }
              onClose={isClosable(tab) ? () => closeTab(tab.id) : undefined}
            />
          );
        })}
      </SortableContext>
    </TabList>
  );

  return (
    <VStack gap={0} xstyle={xstyle}>
      <HStack align="center" gap={1} paddingInline={3} paddingBlockStart={2}>
        <StackItem size="fill" xstyle={styles.strip}>
          {strip}
        </StackItem>
        {endContent}
      </HStack>
      <Divider />
    </VStack>
  );
}
