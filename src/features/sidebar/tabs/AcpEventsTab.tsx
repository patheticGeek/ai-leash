import { listen } from "@tauri-apps/api/event";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button";
import { JsonViewer } from "@/ui/json-viewer";
import { useAppStore } from "../../../store";

interface AcpDebugEvent {
  direction: "received" | "sent";
  event: string;
  payload: unknown;
}

interface DisplayEvent extends AcpDebugEvent {
  id: number;
  receivedAt: Date;
}

export default function AcpEventsTab() {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEvents([]);
    nextId.current = 0;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<AcpDebugEvent>(
      `chat://${activeSessionId}/acp_debug`,
      ({ payload }) => {
        if (disposed) return;
        setEvents((current) => [
          ...current,
          { ...payload, id: nextId.current++, receivedAt: new Date() },
        ]);
      },
    ).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [activeSessionId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: events is a trigger-only dep — scroll to the newest entry on every new event, its value isn't read in the body
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [events]);

  if (!activeSessionId) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0c0e]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-3 py-2">
        <div>
          <div className="text-sm text-zinc-200">ACP Events</div>
          <div className="text-[11px] text-zinc-600">
            Live only; events are discarded when this tab closes.
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Clear events"
          onClick={() => setEvents([])}
          className="text-zinc-500 hover:text-zinc-300"
        >
          <Trash2 size={13} />
        </Button>
      </div>
      {events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-sm text-zinc-600">
          No ACP events received while this tab has been open.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="space-y-2">
            {events.map((item) => (
              <div
                key={item.id}
                className="rounded-md bg-[#141518] px-2.5 py-2 shadow-[var(--al-shadow)]"
              >
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
                  <span className="font-medium text-zinc-300">
                    {item.event}
                  </span>
                  <span className="ml-auto text-zinc-600">
                    {item.receivedAt.toLocaleTimeString()}
                  </span>
                </div>
                <div className="overflow-x-auto text-zinc-500">
                  <JsonViewer data={item.payload} defaultCollapseDepth={1} />
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
      )}
    </div>
  );
}
