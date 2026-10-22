import type { Meta, StoryObj } from "@storybook/react-vite";
import { ListFilter, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const meta = {
  title: "UI/DropdownMenu",
  component: DropdownMenu,
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const [placement, setPlacement] = useState("all");
    const [compact, setCompact] = useState(false);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-lg" title="Filters">
            <ListFilter size={17} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Task chats</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={placement}
            onValueChange={setPlacement}
          >
            <DropdownMenuRadioItem value="all">
              Show all chats
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="top">
              Group at top
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="hide">Hide</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={compact}
            onCheckedChange={setCompact}
          >
            Compact rows
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem variant="danger">
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};
