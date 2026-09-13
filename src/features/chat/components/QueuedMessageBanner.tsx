import { X } from "lucide-react";
import { Button } from "@/ui/button";

interface QueuedMessagesBannerProps {
  messages: string[];
  onCancel: (index: number) => void;
}

// Sits above `ChatInputBar`, one row per message waiting to be sent once the
// turn ahead of it finishes — see `queueMessage`/`interrupt` and the flush
// effect in `ChatPanel.tsx`. Top row goes out next. No inline edit, just a
// preview and a way to drop it.
export default function QueuedMessagesBanner({
  messages,
  onCancel,
}: QueuedMessagesBannerProps) {
  return (
    <div className="z-10 mx-7 -mb-4 flex flex-col gap-1 rounded-t-md bg-blue-950/30 px-3 py-2 text-xs text-blue-300">
      {messages.map((text, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: purely a FIFO display list, position is the identity that matters (top = next out)
          key={i}
          className="flex items-center justify-between gap-3"
        >
          <span className="truncate">Queued: {text}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onCancel(i)}
            title="Cancel queued message"
            className="shrink-0"
          >
            <X size={14} />
          </Button>
        </div>
      ))}
    </div>
  );
}
