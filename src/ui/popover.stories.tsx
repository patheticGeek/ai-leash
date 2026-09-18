import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

const meta = {
  title: "UI/Popover",
  component: Popover,
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="md">
          Open popover
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Title</PopoverTitle>
          <PopoverDescription>Description text.</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  ),
};

export const OpenTop: Story = {
  render: () => (
    <div className="pt-40">
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button
            variant="chip"
            size="none"
            className="flex items-center gap-1"
          >
            Model picker
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-56 p-0"
        >
          <div className="py-1">
            {["Sonnet", "Opus"].map((label, i) => (
              <Button
                key={label}
                variant="menu-item"
                size="none"
                data-active={i === 0}
              >
                {label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
};
