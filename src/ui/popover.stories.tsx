import { Button } from "@astryxdesign/core/Button";
import { Item } from "@astryxdesign/core/Item";
import type { Meta, StoryObj } from "@storybook/react-vite";
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
        <Button variant="secondary" label="Open popover" />
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
          <Button variant="chip" size="sm" label="Model picker" />
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-56 p-0"
        >
          <div className="py-1">
            {["Sonnet", "Opus"].map((label, i) => (
              <Item
                key={label}
                density="compact"
                isSelected={i === 0}
                onClick={() => {}}
                label={label}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
};
