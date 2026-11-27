import { Badge } from "@astryxdesign/core/Badge";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { StackItem } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { defineTheme, Theme, useTheme } from "@astryxdesign/core/theme";
import {
  borderVars,
  colorVars,
  sizeVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import * as stylex from "@stylexjs/stylex";
import { Play, X } from "lucide-react";
import { type ReactNode, useRef, useState, type WheelEvent } from "react";
import { useSubAgents } from "@/data/subAgents";
import { defaultThemeSlug, themes } from "../../astryx-themes";
import { useGenerating } from "../../lib/generatingQuery";
import { useAppStore, type WorkspaceTab } from "../../store";
import { RunIcon } from "../actions/RunIcon";
import { useActions } from "../actions/useActions";
import { useSortableTab } from "./TabDnd";
import TopBand from "./TopBand";
import { tabIcon } from "./tabKinds";

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
  // The selected underline sits on the band's divider, not 1px under the
  // tab: the tabs (size sm) are centred in the taller band (`TopBand`), so
  // drop the indicator through the gap below them plus the divider's
  // border — the same `--_tab-indicator-bottom` TabList's own `hasDivider`
  // sets to land it on its rail (the strip already bleeds by that much, so
  // it isn't clipped).
  tabList: {
    minWidth: 0,
    "--_tab-indicator-bottom": `calc(-1 * ((${spacingVars["--spacing-11"]} - ${sizeVars["--size-element-sm"]}) / 2 + ${borderVars["--border-width"]}))`,
  },
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

// Only the Agent tab can't be closed; the others reopen from the side
// panel's + picker.
const isClosable = (tab: WorkspaceTab) => tab.kind !== "primary";

// A strip with no scroll arrows: TabList's overflow keeps its edge fade on
// the side(s) with hidden tabs, and wheel, drag and focus still scroll it.
// The arrows are their own theme part, so a nested Theme over the app's
// (the pattern Tab's docs give for restyling one strip) hides them here and
// nowhere else.
const arrowlessTheme = defineTheme({
  name: "ai-leash-tab-strip-arrowless",
  extends: themes[defaultThemeSlug],
  components: {
    "tab-scroll-button": { base: { display: "none" } },
  },
});

// A mouse wheel only scrolls vertically, which a one-row strip can't; turn
// it sideways onto the strip's scroller (the element that overflows).
function scrollStripSideways(e: WheelEvent<HTMLElement>) {
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  let el = e.target as HTMLElement | null;
  while (el && el !== e.currentTarget) {
    if (el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY;
      return;
    }
    el = el.parentElement;
  }
}

// An Action output tab's icon carries its run state, from the same list the
// Actions tab and the top bar's split button read: amber Stop while running,
// red Play after a non-zero exit, plain Play otherwise (`RunIcon`). An id
// that's no longer defined keeps the kind's plain icon.
function ActionTabIcon({ actionId }: { actionId: string }) {
  const { actions } = useActions();
  const action = actions.find((a) => a.id === actionId);
  if (!action) return <Icon icon={Play} size="sm" color="secondary" />;
  return <RunIcon action={action} neutralColor="secondary" />;
}

// One tab of the strip: its kind's icon, then its title, then any status.
// A Tab is a <button>, so a close IconButton can't go inside it (a button in
// a button is invalid) and one beside it breaks the hover pill and the
// selected underline. So, like a browser tab, the close control lives in
// the Tab's own icon slot: while the pointer is over the tab or it has
// keyboard focus, the kind icon gives way to an × in the same box, so
// nothing shifts. The × is a button-role element with its own name and
// tooltip; it takes no tab stop (TabList's roving stop stays the one),
// since Ctrl+W on the focused tab is the keyboard path, announced through
// aria-keyshortcuts. Pressing it doesn't start a drag; middle-click anywhere
// on the tab closes it too. The Agent tab has no onClose, so it keeps its
// icon.
function StripTab({
  tab,
  isShining,
  status,
  onClose,
}: {
  tab: WorkspaceTab;
  isShining: boolean;
  /** Passive status after the title: a running count or an unsaved marker. */
  status?: ReactNode;
  onClose?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const closeRef = useRef<HTMLElement>(null);
  const { isDragging, ...sortable } = useSortableTab(tab.id);
  const closeLabel = `Close ${tab.label}`;
  const icon =
    onClose && (isHovered || isFocused) ? (
      <>
        <HStack
          as="span"
          ref={closeRef}
          role="button"
          tabIndex={-1}
          aria-label={closeLabel}
          align="center"
          // No drag, no press feedback, no focus move off the tab.
          onPointerDown={(e: React.PointerEvent) => {
            if (e.button === 0) e.stopPropagation();
          }}
          onMouseDown={(e: React.MouseEvent) => {
            if (e.button === 0) e.preventDefault();
          }}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onClose();
          }}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
        >
          <Icon icon={X} size="sm" color="secondary" />
        </HStack>
        <Tooltip anchorRef={closeRef} content={closeLabel} />
      </>
    ) : tab.kind === "action" && tab.path ? (
      <ActionTabIcon actionId={tab.path} />
    ) : (
      <Icon icon={tabIcon(tab)} size="sm" color="secondary" />
    );
  return (
    <Tab
      {...sortable}
      value={tab.id}
      label={clip(tab.label)}
      icon={icon}
      xstyle={[isShining && styles.shining, isDragging && styles.dragging]}
      endContent={status}
      {...(onClose && {
        "aria-keyshortcuts": "Control+W",
        onPointerEnter: () => setIsHovered(true),
        onPointerLeave: () => setIsHovered(false),
        // Keyboard focus only: a click also focuses the tab, and that
        // shouldn't leave its × showing once the pointer moves off.
        onFocus: (e: React.FocusEvent<HTMLButtonElement>) =>
          setIsFocused(e.currentTarget.matches(":focus-visible")),
        onBlur: () => setIsFocused(false),
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

// The tab row of either area: an underline `TabList` at size sm inside the
// pane's top band (`TopBand`), the same in both panes so the two bands read
// as one bar. Every tab kind can sit in either one, so each tab's
// decorations (icon, running shine, sub-agent count, unsaved marker) follow
// its kind, not the strip it's in. Tabs drag to reorder and between areas
// (`TabDnd.tsx`). `startContent` leads the tabs (the sidebar's expand
// toggle); `endContent` follows them at the band's end (the centre's
// actions and panel toggle, the side panel's + and the window controls).
export default function TabStrip({
  tabs,
  value,
  onSelect,
  label,
  startContent,
  endContent,
  hasScrollArrows = true,
}: {
  tabs: WorkspaceTab[];
  /** The selected tab id ("" for none). */
  value: string;
  onSelect: (id: string) => void;
  /** Names the strip for assistive technology. */
  label: string;
  /** Before the tabs, on the same line. */
  startContent?: ReactNode;
  /** At the band's end, after the tabs. */
  endContent?: ReactNode;
  /** false: overflowing tabs show only the edge fade, no arrow buttons. */
  hasScrollArrows?: boolean;
}) {
  const { mode } = useTheme();
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
      xstyle={styles.tabList}
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
    <TopBand
      start={
        <>
          {startContent}
          <StackItem
            size="fill"
            xstyle={styles.strip}
            onWheel={scrollStripSideways}
          >
            {hasScrollArrows ? (
              strip
            ) : (
              <Theme theme={arrowlessTheme} mode={mode}>
                {strip}
              </Theme>
            )}
          </StackItem>
        </>
      }
      end={endContent}
    />
  );
}
