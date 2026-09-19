import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { Button } from "./button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./conversation";

const meta = {
  title: "UI/Conversation",
  component: Conversation,
  args: { children: null },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Conversation>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({
  autoAppend,
  initialCount = 20,
}: {
  autoAppend?: boolean;
  initialCount?: number;
}) {
  const [count, setCount] = useState(initialCount);
  useEffect(() => {
    if (!autoAppend) return;
    const id = setInterval(() => setCount((c) => c + 1), 1200);
    return () => clearInterval(id);
  }, [autoAppend]);
  return (
    <div className="flex w-96 flex-col gap-2">
      <div className="h-72 rounded-md bg-card ring-1 ring-border">
        <Conversation>
          <ConversationContent className="justify-end text-sm">
            {Array.from({ length: count }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static demo rows
              <div key={i} className="rounded-md bg-raised px-3 py-2">
                Message {i + 1}
              </div>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
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
