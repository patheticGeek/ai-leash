import { VStack } from "@astryxdesign/core/Stack";
import type { Meta, StoryObj } from "@storybook/react-vite";
import Chart from "./Chart";

const meta = {
  title: "UI/Chart",
  component: Chart,
  args: {
    labels: ["Haiku", "Sonnet", "Opus", "Fable"],
    series: [
      { name: "Latency", values: [320, 610, 1150, 840] },
      { name: "Cost", values: [90, 300, 1500, 700] },
    ],
    unit: "ms",
  },
  decorators: [
    (Story) => (
      <VStack width={512}>
        <Story />
      </VStack>
    ),
  ],
} satisfies Meta<typeof Chart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bar: Story = {};
export const Line: Story = {
  args: {
    kind: "line",
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    series: [
      { name: "Runs", values: [12, 18, 9, 22, 30, 4, 7] },
      { name: "Failures", values: [1, 3, 0, 2, 5, 0, -1] },
    ],
    unit: undefined,
  },
};
export const SingleSeries: Story = {
  args: { series: [{ name: "Score", values: [61, 78, 88, 84] }], unit: "%" },
};
