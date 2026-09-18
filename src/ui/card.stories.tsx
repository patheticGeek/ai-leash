import type { Meta, StoryObj } from "@storybook/react-vite";
import { Pause, Play } from "lucide-react";
import { Button } from "./button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "UI/Card",
  component: Card,
  argTypes: { size: { control: "inline-radio", options: ["default", "sm"] } },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Card title</CardTitle>
        <CardDescription>Supporting description text.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Action
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>Body content goes here.</CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>With footer</CardTitle>
        <CardDescription>Footer sits on a muted strip.</CardDescription>
      </CardHeader>
      <CardContent>Body content goes here.</CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
        <Button variant="primary" size="sm">
          Save
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const Small: Story = {
  args: { size: "sm" },
  render: (args) => (
    <Card {...args} className="w-72">
      <CardHeader>
        <CardTitle>Compact card</CardTitle>
        <CardDescription>size="sm" tightens the spacing.</CardDescription>
      </CardHeader>
      <CardContent>Body content goes here.</CardContent>
    </Card>
  ),
};

export const InteractiveRow: Story = {
  name: "Interactive row (whole card is the click target)",
  render: () => (
    <div className="flex w-72 flex-col gap-2">
      {["dev", "build"].map((name) => (
        <Card
          key={name}
          interactive
          className="group flex-row items-stretch gap-0 rounded-md py-0 text-xs"
        >
          <Button
            variant="unstyled"
            size="none"
            className="min-w-0 flex-1 flex-col items-start px-2.5 py-2 text-left"
          >
            <span className="text-zinc-300">{name}</span>
            <span className="text-zinc-600">npm run {name}</span>
          </Button>
          <div className="flex shrink-0 items-center gap-1 pr-2">
            <Button variant="secondary" size="icon-sm" title="Run">
              <Play size={12} />
            </Button>
            <Button variant="ghost" size="icon-sm" title="Pause">
              <Pause size={12} />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  ),
};

export const SelectedChoice: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-2">
      <Card interactive selected className="gap-1 rounded-md px-3 py-2.5">
        <span className="text-sm text-zinc-200">Claude Code (default)</span>
        <span className="text-xs text-zinc-600">acp · claude</span>
      </Card>
      <Card interactive className="gap-1 rounded-md px-3 py-2.5">
        <span className="text-sm text-zinc-200">Local Ollama</span>
        <span className="text-xs text-zinc-600">localhost:11434</span>
      </Card>
    </div>
  ),
};
