import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { Button } from "./button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "./message-scroller";

const meta = {
  title: "UI/MessageScroller",
  component: MessageScroller,
  parameters: { layout: "centered" },
} satisfies Meta<typeof MessageScroller>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({
  autoAppend,
  initialCount = 20,
  loadAfterMs,
}: {
  autoAppend?: boolean;
  initialCount?: number;
  /** Mount empty, then load `initialCount` messages at once (opening a saved conversation). */
  loadAfterMs?: number;
}) {
  const [count, setCount] = useState(loadAfterMs ? 0 : initialCount);
  useEffect(() => {
    if (!loadAfterMs) return;
    const id = setTimeout(() => setCount(initialCount), loadAfterMs);
    return () => clearTimeout(id);
  }, [loadAfterMs, initialCount]);
  useEffect(() => {
    if (!autoAppend) return;
    const id = setInterval(() => setCount((c) => c + 1), 1200);
    return () => clearInterval(id);
  }, [autoAppend]);
  return (
    <div className="flex w-96 flex-col gap-2">
      <div className="h-72 rounded-md bg-card ring-1 ring-border">
        <MessageScrollerProvider autoScroll defaultScrollPosition="end">
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent className="justify-end gap-2 p-3 text-sm">
                {Array.from({ length: count }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static demo rows
                  <MessageScrollerItem key={i}>
                    <div className="rounded-md bg-raised px-3 py-2">
                      Message {i + 1}
                    </div>
                  </MessageScrollerItem>
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
      {!autoAppend && (
        <Button variant="secondary" onClick={() => setCount((c) => c + 1)}>
          Add message
        </Button>
      )}
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
export const StreamingNewMessages: Story = {
  render: () => <Demo autoAppend />,
};
/** Short transcripts sit at the bottom of the box. */
export const ShortBottomAligned: Story = {
  render: () => <Demo initialCount={3} />,
};
/** History arriving after mount lands at the bottom. */
export const HistoryLoadsAfterMount: Story = {
  render: () => <Demo initialCount={60} loadAfterMs={400} />,
};
