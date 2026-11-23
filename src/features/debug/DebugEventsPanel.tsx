import { IconButton } from "@astryxdesign/core/IconButton";
import { Selector } from "@astryxdesign/core/Selector";
import { MoveDiagonal2, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useConversations } from "@/data/conversations";
import { JsonViewer } from "@/ui/json-viewer";
import { type AcpDebugEvent, useAppStore } from "../../store";

const ALL_CONVERSATIONS = "__all__";

/**
 * The devtools-style global ACP event inspector. Shows every event captured
 * app-wide since debug mode was last enabled (see `useDebugEventCapture`),
 * filterable to one conversation. Purely a view over `debugEvents` — this
 * component holds no state of its own besides the filter, so closing and
 * reopening it (toggled via `debugPanelOpen`) never loses anything; only
 * turning debug mode off does.
 */
export default function DebugEventsPanel({
  onClose,
  onDragStart,
  onResizeStart,
}: {
  onClose: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  const events = useAppStore((s) => s.debugEvents);
  const clearDebugEvents = useAppStore((s) => s.clearDebugEvents);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const conversations = useConversations();
  const [filter, setFilter] = useState<string>(ALL_CONVERSATIONS);

  const conversationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of events) ids.add(item.sessionId);
    return Array.from(ids);
  }, [events]);

  const filtered =
    filter === ALL_CONVERSATIONS
      ? events
      : events.filter((e) => e.sessionId === filter);

  function labelFor(id: string) {
    const title = conversations.find((c) => c.id === id)?.title;
    const base = title ?? `${id.slice(0, 8)}…`;
    return id === activeSessionId ? `${base} (active)` : base;
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-sunken shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-3 py-2">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only
            drag affordance — the panel is still fully usable (open/close/
            filter/clear) without ever moving it, so there's no keyboard
            equivalent to wire up here. */}
        <div
          onMouseDown={onDragStart}
          className="cursor-grab select-none active:cursor-grabbing"
        >
          <div className="text-sm text-zinc-200">ACP Events</div>
          <div className="text-[11px] text-zinc-600">
            Live only, app-wide — cleared when debug mode is turned off.
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            variant="ghost"
            size="sm"
            label="Clear events"
            tooltip="Clear events"
            icon={<Trash2 size={13} />}
            onClick={clearDebugEvents}
          />
          <IconButton
            variant="ghost"
            size="sm"
            label="Close panel"
            tooltip="Close panel"
            icon={<X size={13} />}
            onClick={onClose}
          />
        </div>
      </div>
      <div className="shrink-0 border-b border-white/5 px-3 py-2">
        {/* Astryx opens its option list in the top layer, so it paints above
            this `z-[999]` panel (see `DebugDevtoolsOverlay`) without a
            z-index of its own. */}
        <Selector
          label="Conversation"
          isLabelHidden
          size="sm"
          width="100%"
          value={filter}
          onChange={setFilter}
          options={[
            { value: ALL_CONVERSATIONS, label: "All conversations" },
            ...conversationIds.map((id) => ({
              value: id,
              label: labelFor(id),
            })),
          ]}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-sm text-zinc-600">
          No ACP events captured yet.
        </div>
      ) : (
        <DebugEventsList events={filtered} />
      )}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only
          resize affordance, same reasoning as the drag handle above —
          the panel's default size is always usable without it. */}
      <div
        onMouseDown={onResizeStart}
        title="Resize"
        className="absolute bottom-0.5 right-0.5 flex h-4 w-4 cursor-nwse-resize items-center justify-center text-zinc-700 hover:text-zinc-500"
      >
        <MoveDiagonal2 size={12} />
      </div>
    </div>
  );
}

function DebugEventsList({ events }: { events: AcpDebugEvent[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="space-y-2">
        {events.map((item) => (
          <div key={item.id} className="rounded-md bg-raised px-2.5 py-2">
            <div className="mb-1 flex items-center gap-2 text-[11px]">
              <span
                className={
                  item.direction === "received"
                    ? "text-sky-400"
                    : "text-amber-400"
                }
              >
                {item.direction}
              </span>
              <span className="font-medium text-zinc-300">{item.event}</span>
              <span className="ml-auto shrink-0 text-zinc-600">
                {new Date(item.receivedAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="mb-1 truncate text-[10px] text-zinc-600">
              conversation {item.sessionId}
            </div>
            <div className="overflow-x-auto text-zinc-500">
              <JsonViewer data={item.payload} defaultCollapseDepth={1} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
