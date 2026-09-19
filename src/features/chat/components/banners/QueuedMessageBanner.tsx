import { X } from "lucide-react";
import { AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import DockedBanner from "./DockedBanner";

interface QueuedMessagesBannerProps {
  messages: string[];
  onCancel: (index: number) => void;
}

// Sits above `ChatInputBar`, one row per message waiting to be sent once the
// turn ahead of it finishes — see `ChatComposer.tsx`'s `queueMessage` and the flush
// effect in `useMessageQueue.ts`. Top row goes out next. No inline edit, just a
// preview and a way to drop it.
export default function QueuedMessagesBanner({
  messages,
  onCancel,
}: QueuedMessagesBannerProps) {
  return (
    <DockedBanner variant="info">
      <AlertDescription className="flex flex-col gap-1">
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
      </AlertDescription>
    </DockedBanner>
  );
}
