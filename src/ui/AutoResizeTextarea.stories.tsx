import type { Meta, StoryObj } from "@storybook/react-vite";
import { AutoResizeTextarea } from "./AutoResizeTextarea";

const meta = {
  title: "UI/AutoResizeTextarea",
  component: AutoResizeTextarea,
  args: { placeholder: "Type a few lines…", minRows: 2, maxRows: 5 },
  decorators: [
    (Story) => (
      <div className="w-72 rounded-md bg-card p-2 ring-1 ring-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AutoResizeTextarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Starts taller than `minRows`; grows to fit its initial text. */
export const PrefilledLong: Story = {
  args: {
    defaultValue: Array.from({ length: 4 }, (_, i) => `Line ${i + 1}`).join(
      "\n",
    ),
  },
};
/** Past `maxRows` it stops growing and scrolls. */
export const ScrollsPastMax: Story = {
  args: {
    defaultValue: Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join(
      "\n",
    ),
  },
};
