import type { Meta, StoryObj } from "@storybook/react-vite";
import ResizeHandle from "./ResizeHandle";

const meta = {
  title: "UI/ResizeHandle",
  component: ResizeHandle,
  args: {
    width: 240,
    min: 160,
    max: 480,
    onMouseDown: () => {},
    onKeyDown: () => {},
  },
  decorators: [
    (Story) => (
      <div className="flex h-32 w-72 rounded-md bg-card">
        <div className="flex-1 p-3 text-xs text-muted-foreground">
          Hover the strip on the right edge (col-resize cursor)
        </div>
        <Story />
        <div className="w-16 bg-sunken" />
      </div>
    ),
  ],
} satisfies Meta<typeof ResizeHandle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
