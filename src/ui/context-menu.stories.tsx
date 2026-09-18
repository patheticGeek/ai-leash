import type { Meta, StoryObj } from "@storybook/react-vite";
import { Pencil, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./context-menu";

const meta = {
  title: "UI/ContextMenu",
  component: ContextMenu,
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex h-32 w-72 items-center justify-center rounded-md bg-card text-sm text-muted-foreground shadow-[var(--al-shadow)]">
          Right-click here
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>
          <Pencil />
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="danger">
          <Trash2 />
          Delete conversation
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
};
