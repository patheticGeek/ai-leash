import type { Meta, StoryObj } from "@storybook/react-vite";
import { Columns2, MessageSquare, SquareKanban } from "lucide-react";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

const meta = {
  title: "UI/ToggleGroup",
  component: ToggleGroup,
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { type: "single" },
  render: function Render() {
    const [value, setValue] = useState("both");
    return (
      <ToggleGroup
        type="single"
        size="sm"
        spacing={0}
        variant="outline"
        value={value}
        onValueChange={(v) => v && setValue(v)}
      >
        <ToggleGroupItem value="board">
          <SquareKanban />
          Board
        </ToggleGroupItem>
        <ToggleGroupItem value="both">
          <Columns2 />
          Both
        </ToggleGroupItem>
        <ToggleGroupItem value="chat">
          <MessageSquare />
          Chat
        </ToggleGroupItem>
      </ToggleGroup>
    );
  },
};
