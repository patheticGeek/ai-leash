import { useEffect, useState } from "react";
import type { Attachment } from "../../../lib/tauriApi";

export interface QueuedMessage {
  text: string;
  attachments: Attachment[];
}

// Messages typed while a turn is in flight, held FIFO until each gets its
// turn: whenever `sending` flips to false the head is popped and handed to
// `submit` (the normal send path), which starts the next turn. `enqueue` is
// only reachable while `sending` (see `ChatComposer`'s `showQueue`), so
// there's always a turn ahead of it to wait on.
export function useMessageQueue(
  sending: boolean,
  submit: (message: QueuedMessage) => void,
) {
  const [queued, setQueued] = useState<QueuedMessage[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only `sending`'s transition to false should trigger this — `queued`/`submit` are read fresh, not meant to re-run the effect on their own
  useEffect(() => {
    if (sending || queued.length === 0) return;
    const [next, ...rest] = queued;
    setQueued(rest);
    submit(next);
  }, [sending]);

  return {
    queued,
    enqueue: (message: QueuedMessage) =>
      setQueued((prev) => [...prev, message]),
    remove: (index: number) =>
      setQueued((prev) => prev.filter((_, i) => i !== index)),
    clear: () => setQueued([]),
    // Puts back what `clear` dropped, ahead of anything queued since.
    restore: (items: QueuedMessage[]) =>
      setQueued((prev) => [...items, ...prev]),
  };
}
