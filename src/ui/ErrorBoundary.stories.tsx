import type { Meta, StoryObj } from "@storybook/react-vite";
import ErrorBoundary from "./ErrorBoundary";

function Boom(): never {
  throw new Error("Example render error");
}

const meta = {
  title: "UI/ErrorBoundary",
  component: ErrorBoundary,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fallback: Story = {
  args: { children: null },
  render: () => (
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>
  ),
};
