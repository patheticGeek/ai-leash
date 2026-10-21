import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { type TabArea, useAppStore, type WorkspaceTab } from "../../store";
import { tabAreaOf } from "../../store/panelSlice";

// Drag-and-drop for the centre and side tab strips: reorder within a strip,
// or drag a tab into the other area (onto a tab to land beside it, or
// anywhere else in that panel to land at the end). Pointer-based (dnd-kit)
// rather than HTML5 drag and drop, which Tauri's native file-drop handling
// intercepts. The store does the actual moving (`moveTab`); the primary
// Agent tab is pinned to the centre.

const AREA_PREFIX = "area:";
const areaDropId = (area: TabArea) => `${AREA_PREFIX}${area}`;
const isAreaDropId = (id: string | number) =>
  String(id).startsWith(AREA_PREFIX);

// Tabs win over the panel they sit in; a panel catches drops anywhere else
// in it.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const tab = hits.find((c) => !isAreaDropId(c.id));
  return tab ? [tab] : hits.slice(0, 1);
};

export function TabDndProvider({ children }: { children: ReactNode }) {
  const moveTab = useAppStore((s) => s.moveTab);
  const [dragging, setDragging] = useState<WorkspaceTab | null>(null);
  // A small threshold, so a plain click still just selects/closes a tab.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Where a drop over `overId` lands: that tab's slot, or the end of a panel.
  function target(overId: string | number) {
    const s = useAppStore.getState();
    if (isAreaDropId(overId)) {
      const area = String(overId).slice(AREA_PREFIX.length) as TabArea;
      const tabs = area === "center" ? s.chatTabs : s.panelTabs;
      return { area, index: tabs.length, overTab: false };
    }
    const area = tabAreaOf(s, String(overId));
    if (!area) return null;
    const tabs = area === "center" ? s.chatTabs : s.panelTabs;
    return {
      area,
      index: tabs.findIndex((t) => t.id === overId),
      overTab: true,
    };
  }

  function onDragStart({ active }: DragStartEvent) {
    const s = useAppStore.getState();
    setDragging(
      [...s.chatTabs, ...s.panelTabs].find((t) => t.id === active.id) ?? null,
    );
  }

  // Crossing into the other area moves the tab there right away, so it
  // takes its place in that strip while still being dragged.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = tabAreaOf(useAppStore.getState(), String(active.id));
    const to = target(over.id);
    if (!from || !to || to.area === from) return;
    moveTab(String(active.id), to.area, to.index);
  }

  // Within one area, the drop reorders.
  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    if (!over || over.id === active.id) return;
    const from = tabAreaOf(useAppStore.getState(), String(active.id));
    const to = target(over.id);
    if (!to?.overTab || to.area !== from) return;
    moveTab(String(active.id), to.area, to.index);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="cursor-grabbing rounded-md border border-border bg-raised px-2 py-1.5 text-xs text-zinc-100 shadow-lg">
            <span className="block max-w-[12rem] truncate">
              {dragging.label}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** Makes a whole panel a drop target for tabs dragged in from the other. */
export function useTabDropArea(area: TabArea) {
  return useDroppable({ id: areaDropId(area) }).setNodeRef;
}

export function SortableTab({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("shrink-0", isDragging && "opacity-40")}
      {...listeners}
    >
      {children}
    </div>
  );
}
