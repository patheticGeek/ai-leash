import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./resizable";

const meta = {
  title: "UI/Resizable",
  component: ResizablePanelGroup,
} satisfies Meta<typeof ResizablePanelGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { orientation: "horizontal" },
  render: (args) => (
    <div className="h-64 w-[36rem] rounded-md ring-1 ring-border">
      <ResizablePanelGroup {...args}>
        <ResizablePanel minSize="30">
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Board
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="35" minSize="20" collapsible>
          <div className="flex h-full items-center justify-center bg-sunken text-sm text-muted-foreground">
            Project chat
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  ),
};
