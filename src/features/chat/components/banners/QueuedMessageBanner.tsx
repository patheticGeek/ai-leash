import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { X } from "lucide-react";
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
    <DockedBanner
      status="info"
      title={
        messages.length === 1
          ? "1 queued message"
          : `${messages.length} queued messages`
      }
    >
      <VStack gap={1}>
        {messages.map((text, i) => (
          <HStack
            // biome-ignore lint/suspicious/noArrayIndexKey: purely a FIFO display list, position is the identity that matters (top = next out)
            key={i}
            align="center"
            justify="between"
            gap={3}
          >
            <Text type="supporting" maxLines={1}>
              {text}
            </Text>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onCancel(i)}
              title="Cancel queued message"
              className="shrink-0"
            >
              <X size={14} />
            </Button>
          </HStack>
        ))}
      </VStack>
    </DockedBanner>
  );
}
