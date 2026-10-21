import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RunCommandContext } from "@/ui/Markdown";
import { useAppStore, type WorkspaceTab } from "../../store";
import { TAB_KINDS } from "./tabKinds";

// A "keep-mounted-per-tab" tab's content can't live under the panel showing
// it: dragging the tab to the other area would unmount it there and mount it
// afresh here, killing a terminal's shell or a chat's live stream. Instead
// `TabContentHost` (mounted once, in `App`) portals each such tab's content
// into a detached element of its own, and whichever area holds the tab
// adopts that element into a `TabSlot` — moving a tab just moves the DOM
// node, React never sees a remount.
const elements = new Map<string, HTMLDivElement>();

function tabElement(id: string): HTMLDivElement {
  let el = elements.get(id);
  if (!el) {
    el = document.createElement("div");
    el.style.height = "100%";
    elements.set(id, el);
  }
  return el;
}

const keepsMounted = (t: WorkspaceTab) =>
  TAB_KINDS[t.kind].mountMode === "keep-mounted-per-tab";

export function TabContentHost() {
  const chatTabs = useAppStore((s) => s.chatTabs);
  const panelTabs = useAppStore((s) => s.panelTabs);
  const viewEpoch = useAppStore((s) => s.viewEpoch);
  // Same gate as `CenterPanel`'s empty state — nothing to show tabs for.
  const ready = useAppStore(
    (s) => !!s.projectRoot && (!!s.activeSessionId || s.draft !== null),
  );
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  // The run button on a transcript's shell code blocks: a new terminal tab
  // with the command typed at the prompt, waiting for Enter.
  const openInTerminal = useCallback(
    (command: string) => openPanelTab("terminal", { command }),
    [openPanelTab],
  );

  const tabs = ready ? [...chatTabs, ...panelTabs].filter(keepsMounted) : [];

  // Drop the elements of tabs that have closed — their portals unmounted in
  // this same commit.
  useEffect(() => {
    const open = new Set(tabs.map((t) => t.id));
    for (const [id, el] of elements) {
      if (open.has(id)) continue;
      el.remove();
      elements.delete(id);
    }
  });

  return (
    <RunCommandContext.Provider value={openInTerminal}>
      {tabs.map((tab) =>
        createPortal(
          TAB_KINDS[tab.kind].render(tab),
          tabElement(tab.id),
          // The primary chat restarts per conversation switch, as it did
          // under `CenterPanel`'s `key={viewEpoch}` — not per id, so a new
          // thread getting its id on its first message doesn't remount it.
          tab.kind === "primary" ? `${tab.id}:${viewEpoch}` : tab.id,
        ),
      )}
    </RunCommandContext.Provider>
  );
}

// Adopts tab `id`'s element from `TabContentHost`. A layout effect, so the
// element is attached before the content's own (passive) mount effects run —
// a terminal measures its container when it opens.
function TabSlot({ id, visible }: { id: string; visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const slot = ref.current;
    if (!slot) return;
    const el = tabElement(id);
    slot.appendChild(el);
    return () => {
      if (el.parentNode === slot) slot.removeChild(el);
    };
  }, [id]);
  return <div ref={ref} className={visible ? "h-full" : "hidden"} />;
}

// One area's tab content: every keep-mounted tab's slot (only the active one
// visible) plus the active tab's content if it's an "active-only" kind.
export function TabBody({
  tabs,
  activeId,
  hidden = false,
}: {
  tabs: WorkspaceTab[];
  activeId: string | null;
  /** Hide every tab, e.g. while the side panel shows its tab picker. */
  hidden?: boolean;
}) {
  const active = tabs.find((t) => t.id === activeId) ?? null;
  return (
    <>
      {/* Id order, not tab order: reordering tabs then never moves a slot
          in the DOM, which would detach the visible one and reset its
          scroll position. */}
      {tabs
        .filter(keepsMounted)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((tab) => (
          <TabSlot
            key={tab.id}
            id={tab.id}
            visible={tab.id === activeId && !hidden}
          />
        ))}
      {!hidden &&
        active &&
        !keepsMounted(active) &&
        TAB_KINDS[active.kind].render(active)}
    </>
  );
}
