import type { Preview } from "@storybook/react-vite";
import { themes } from "storybook/theming";
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
    docs: {
      canvas: { sourceState: "shown" },
      // Docs pages render outside the canvas iframe styles, so they need the
      // app palette (see --al-* in src/index.css) passed as real colors.
      theme: {
        ...themes.dark,
        appBg: "#101114",
        appContentBg: "#101114",
        appPreviewBg: "#101114",
        barBg: "#0b0c0e",
        appBorderColor: "#26272c",
        textColor: "#e4e4e7",
        colorSecondary: "#3a5f8f",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="dark p-6 font-sans text-foreground">
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </div>
    ),
  ],
};

export default preview;
