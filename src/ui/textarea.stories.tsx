import type { Meta, StoryObj } from "@storybook/react-vite";
import { Textarea } from "./textarea";

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  args: { placeholder: "Ask the agent…", rows: 3 },
  argTypes: { disabled: { control: "boolean" } },
  decorators: [
    (Story) => (
      <div className="w-72 rounded-md bg-card p-2 ring-1 ring-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
