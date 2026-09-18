import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";

const meta = {
  title: "UI/Input",
  component: Input,
  args: { placeholder: "Type here…" },
  argTypes: {
    variant: { control: "select", options: ["default", "chip", "unstyled"] },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { args: { variant: "default" } };

export const Variants: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-3">
      <Input variant="default" placeholder="default" />
      <Input variant="chip" placeholder="chip" />
      <Input variant="unstyled" placeholder="unstyled" />
      <Input variant="default" placeholder="disabled" disabled />
    </div>
  ),
};
