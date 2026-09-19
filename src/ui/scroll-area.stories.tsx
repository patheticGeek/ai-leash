import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollArea } from "./scroll-area";

const meta = {
  title: "UI/ScrollArea",
  component: ScrollArea,
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-48 w-64 rounded-md bg-card shadow-[var(--al-shadow)]">
      <div className="space-y-2 p-3 text-sm">
        {Array.from({ length: 30 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static demo rows
          <div key={i}>Row {i + 1}</div>
        ))}
      </div>
    </ScrollArea>
  ),
};
