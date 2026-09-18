import type { Preview } from "@storybook/react-vite";
import { TooltipProvider } from "../src/ui/tooltip";
import "../src/index.css";
import "./storybook.css";

// ai-leash is dark-only (see `color-scheme: dark` in index.css), so the
// canvas uses the app's own --background instead of Storybook's light/dark
// toggle.
const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i } },
    docs: { canvas: { sourceState: "shown" } },
  },
  decorators: [
    (Story) => (
      <div className="dark bg-background p-6 font-sans text-foreground">
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </div>
    ),
  ],
};

export default preview;
