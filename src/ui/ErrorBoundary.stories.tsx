import type { Meta, StoryObj } from "@storybook/react-vite";
import ErrorBoundary from "./ErrorBoundary";

function Boom(): never {
  throw new Error("Example render error");
}

// The fallback fills its parent (h-full w-full), so the stories give it a
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
      <div className="h-screen w-screen">
        <Story />
      </div>
    ),
  ],
};

export const InsidePanel: Story = {
  decorators: [
    (Story) => (
      <div className="h-80 w-[28rem] overflow-hidden rounded-xl shadow-[var(--al-shadow)]">
        <Story />
      </div>
    ),
  ],
};
