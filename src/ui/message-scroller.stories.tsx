import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { Button } from "./button";
import { MessageScroller } from "./message-scroller";

const meta = {
  title: "UI/MessageScroller",
  component: MessageScroller,
  args: { scrollKey: 0, children: null },
  parameters: { layout: "centered" },
} satisfies Meta<typeof MessageScroller>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ autoAppend }: { autoAppend?: boolean }) {
  const [count, setCount] = useState(20);
  useEffect(() => {
    if (!autoAppend) return;
    const id = setInterval(() => setCount((c) => c + 1), 1200);
    return () => clearInterval(id);
  }, [autoAppend]);
  return (
    <div className="flex w-96 flex-col gap-2">
      <div className="h-72 rounded-md bg-card shadow-[var(--al-shadow)]">
        <MessageScroller
          scrollKey={count}
          contentClassName="space-y-2 p-3 text-sm"
        >
          {Array.from({ length: count }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static demo rows
            <div key={i} className="rounded-md bg-raised px-3 py-2">
              Message {i + 1}
            </div>
          ))}
        </MessageScroller>
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
