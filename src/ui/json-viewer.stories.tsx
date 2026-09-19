import type { Meta, StoryObj } from "@storybook/react-vite";
import { JsonViewer } from "./json-viewer";

const sample = {
  tool: "run_action",
  args: { name: "build", env: { CI: true }, retries: 3, tags: ["a", "b"] },
  result: null,
  ok: true,
};

const meta = {
  title: "UI/JsonViewer",
  component: JsonViewer,
  args: { data: sample, defaultCollapseDepth: 2 },
  argTypes: {
    defaultCollapseDepth: { control: { type: "number", min: 0, max: 5 } },
  },
} satisfies Meta<typeof JsonViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Collapsed: Story = { args: { defaultCollapseDepth: 0 } };
export const FullyExpanded: Story = { args: { defaultCollapseDepth: 5 } };
