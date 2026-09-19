import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bot, Wrench } from "lucide-react";
import { useState } from "react";
import { Marker } from "./marker";

const meta = {
  title: "UI/Marker",
  component: Marker,
  args: { label: "Thought" },
  decorators: [
    (Story) => (
      <div className="w-[28rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Marker>;

export default meta;
type Story = StoryObj<typeof meta>;

function Toggleable(props: React.ComponentProps<typeof Marker>) {
  const [expanded, setExpanded] = useState(props.expanded ?? false);
  return (
    <Marker
      {...props}
      expanded={expanded}
      onToggle={() => setExpanded((e) => !e)}
    />
  );
}

export const Thinking: Story = {
  render: () => (
    <div className="space-y-2">
      <Toggleable italic shine label="Thinking…">
        <div className="whitespace-pre-wrap italic">Working through it…</div>
      </Toggleable>
      <Toggleable italic label="Thought">
        <div className="whitespace-pre-wrap italic">
          The user wants a summary of the diff, so read it first.
        </div>
      </Toggleable>
    </div>
  ),
};

export const ToolCall: Story = {
  render: () => (
    <div className="space-y-2">
      <Toggleable
        fullWidth
        icon={<Wrench />}
        label="read_file"
        summary={JSON.stringify({ path: "src/ui/button.tsx" })}
      >
        <pre className="select-text whitespace-pre-wrap">{"contents…"}</pre>
      </Toggleable>
      <Toggleable
        fullWidth
        icon={<Bot />}
        label="spawn_sub_agent"
        summary={JSON.stringify({ description: "audit the ui components" })}
        status="running"
      />
      <Toggleable
        fullWidth
        icon={<Wrench />}
        label="run_action"
        summary={JSON.stringify({ name: "build" })}
        status="failed"
      >
        <pre className="select-text whitespace-pre-wrap text-red-300">
          {"exit code 1"}
        </pre>
      </Toggleable>
    </div>
  ),
};

export const Static: Story = {
  args: { label: "system prompt", italic: true },
};
