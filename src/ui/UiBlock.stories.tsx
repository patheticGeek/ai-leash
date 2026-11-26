import { VStack } from "@astryxdesign/core/Stack";
import type { Meta, StoryObj } from "@storybook/react-vite";
import UiBlock, { UiSendContext } from "./UiBlock";

const comparison = [
  { type: "heading", text: "Model comparison" },
  {
    type: "stats",
    items: [
      { label: "Fastest", value: "Haiku", change: "320 ms", tone: "success" },
      { label: "Best score", value: "88%", change: "Opus", tone: "info" },
      { label: "Priciest", value: "$15 / M", change: "+5×", tone: "warning" },
    ],
  },
  {
    type: "table",
    columns: [
      "Model",
      { key: "latency", label: "Latency (ms)" },
      { key: "score", label: "Score" },
      "Status",
    ],
    rows: [
      ["Haiku", 320, 61, "GA"],
      ["Sonnet", 610, 78, "GA"],
      ["Opus", 1150, 88, "GA"],
      ["Fable", 840, 84, "Preview"],
    ],
  },
  {
    type: "chart",
    title: "Score by model",
    labels: ["Haiku", "Sonnet", "Opus", "Fable"],
    series: [{ name: "Score", values: [61, 78, 88, 84] }],
    unit: "%",
  },
  {
    type: "tabs",
    tabs: [
      {
        label: "Details",
        children: [
          {
            type: "keyValue",
            items: [
              { label: "Context", value: "200k" },
              { label: "Tools", value: true },
            ],
          },
        ],
      },
      {
        label: "Progress",
        children: [
          { type: "progress", label: "Benchmarks run", value: 42, max: 60 },
          {
            type: "stack",
            direction: "horizontal",
            children: [
              { type: "status", label: "Healthy", tone: "success" },
              { type: "badge", label: "Preview", tone: "warning" },
            ],
          },
        ],
      },
    ],
  },
  {
    type: "card",
    title: "Next steps",
    children: [
      {
        type: "list",
        ordered: true,
        items: [
          "Re-run the flaky benchmark",
          {
            title: "Pick a default",
            description: "Used for new chats",
            badge: "Needs you",
          },
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Scores are from one run",
        text: "Variance is about ±3%.",
      },
      {
        type: "choices",
        prompt: "Which should be the default?",
        options: [
          "Sonnet",
          { label: "Opus", message: "Make Opus the default model" },
        ],
      },
    ],
  },
];

const meta = {
  title: "UI/UiBlock",
  component: UiBlock,
  args: { source: JSON.stringify(comparison, null, 2) },
  decorators: [
    (Story) => (
      <UiSendContext.Provider value={(m) => console.log("send", m)}>
        <VStack width={640}>
          <Story />
        </VStack>
      </UiSendContext.Provider>
    ),
  ],
} satisfies Meta<typeof UiBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison: Story = {};
export const Streaming: Story = {
  args: { source: '{"type": "table", "columns": ["A"', isPending: true },
};
export const InvalidJson: Story = { args: { source: '{"type": "table", ' } };
export const InvalidSpec: Story = {
  args: {
    source:
      '{"type": "chart", "labels": ["a", "b"], "series": [{"values": [1]}]}',
  },
};
