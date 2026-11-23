import { ChatComposerDrawer } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Token } from "@astryxdesign/core/Token";
import { ListOrdered } from "lucide-react";

// The composer's drawer: one removable `Token` per message waiting to go out
// once the turn ahead of it finishes — see `ChatComposer`'s `queueMessage`
// and the flush effect in `useMessageQueue.ts`. First token goes out next.
// Always open: no `count`, so the drawer has no collapse handle.
export default function QueuedDrawer({
  messages,
  onCancel,
}: {
  messages: string[];
  onCancel: (index: number) => void;
}) {
  return (
    <ChatComposerDrawer label="Queued" aria-label="Queued messages">
      <HStack gap={1} wrap="wrap">
        {messages.map((text, i) => (
          <Token
            // biome-ignore lint/suspicious/noArrayIndexKey: purely a FIFO display list, position is the identity that matters (first = next out)
            key={i}
            label={text}
            icon={<ListOrdered size={14} />}
            onRemove={() => onCancel(i)}
          />
        ))}
      </HStack>
    </ChatComposerDrawer>
  );
}
