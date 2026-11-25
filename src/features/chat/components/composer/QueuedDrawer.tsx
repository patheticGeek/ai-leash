import { ChatComposerDrawer } from "@astryxdesign/core/Chat";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { ListOrdered } from "lucide-react";

// A queued message's token shows its first line, cut to this many
// characters. The drawer's content row doesn't bound a token's width, so
// Token's own ellipsis never kicks in, and a long message would stretch the
// drawer past the composer and cover what's around it. The whole message is
// in the token's tooltip.
const MAX_LABEL_CHARS = 80;

function shortLabel(text: string): string {
  const firstLine = text.trim().split("\n", 1)[0] ?? "";
  const isCut =
    firstLine.length > MAX_LABEL_CHARS || firstLine.length < text.trim().length;
  const shown = firstLine.slice(0, MAX_LABEL_CHARS).trimEnd();
  return isCut ? `${shown}…` : shown;
}

// The composer's drawer: one removable `Token` per message waiting to go out
// once the turn ahead of it finishes — see `ChatComposer`'s `queueMessage`
// and the flush effect in `useMessageQueue.ts`. First token goes out next.
// Always open: no `count`, so the drawer has no collapse handle. The drawer's
// content row already lays the tokens out (wrapping, with a gap).
export default function QueuedDrawer({
  messages,
  onCancel,
}: {
  messages: string[];
  onCancel: (index: number) => void;
}) {
  return (
    <ChatComposerDrawer label="Queued" aria-label="Queued messages">
      {messages.map((text, i) => (
        <Tooltip
          // biome-ignore lint/suspicious/noArrayIndexKey: purely a FIFO display list, position is the identity that matters (first = next out)
          key={i}
          content={<Text maxLines={8}>{text}</Text>}
          delay={600}
        >
          <Token
            label={shortLabel(text)}
            icon={<ListOrdered size={14} />}
            onRemove={() => onCancel(i)}
          />
        </Tooltip>
      ))}
    </ChatComposerDrawer>
  );
}
