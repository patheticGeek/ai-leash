import { MoveDiagonal2, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useConversations } from "@/data/conversations";
import { Button } from "@/ui/button";
import { JsonViewer } from "@/ui/json-viewer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
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
          <Button
            variant="quiet"
            size="icon-sm"
            title="Clear events"
            onClick={clearDebugEvents}
          >
            <Trash2 size={13} />
          </Button>
          <Button
            variant="quiet"
            size="icon-sm"
            title="Close panel"
            onClick={onClose}
          >
            <X size={13} />
          </Button>
        </div>
      </div>
      <div className="shrink-0 border-b border-white/5 px-3 py-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="All conversations" />
          </SelectTrigger>
          {/* This panel is `z-[999]` (see `DebugDevtoolsOverlay`) so it can
              float above the whole app — `SelectContent`'s own portal
              defaults to `z-50`, which paints *underneath* that regardless
              of DOM order, making the dropdown open invisibly behind the
              panel. Bumped above the panel's own z-index. */}
          <SelectContent className="z-[1000]">
            <SelectItem
              value={ALL_CONVERSATIONS}
              className="cursor-pointer px-3 py-2"
            >
              All conversations
            </SelectItem>
            {conversationIds.map((id) => (
              <SelectItem
                key={id}
                value={id}
                className="cursor-pointer px-3 py-2"
              >
                {labelFor(id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
