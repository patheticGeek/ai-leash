import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Stack";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ErrorBoundary from "./ErrorBoundary";

function Boom(): never {
  throw new Error("Example render error");
}

// The fallback fills its parent, so the stories give it a
// sized box — the way it sits inside #root in the app or inside a panel.
const meta = {
  title: "UI/ErrorBoundary",
  component: ErrorBoundary,
  args: { children: null },
  render: () => (
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>
  ),
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullWindow: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <VStack width="100vw" height="100vh">
        <Story />
      </VStack>
    ),
  ],
};

export const InsidePanel: Story = {
  decorators: [
    (Story) => (
      <Card padding={0} width={448} height={320}>
        <Story />
      </Card>
    ),
  ],
};
