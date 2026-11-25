import { LayerProvider } from "@astryxdesign/core/Layer";
import { VStack } from "@astryxdesign/core/Stack";
import { Theme } from "@astryxdesign/core/theme";
import type { Preview } from "@storybook/react-vite";
import { themes } from "storybook/theming";
import {
  themes as astryxThemes,
  defaultThemeSlug,
  themeModes,
} from "../src/astryx-themes";
import "../src/index.css";
import "./storybook.css";

// ai-leash is dark-only (see `color-scheme: dark` in index.css), so stories
// render in the app's own Astryx theme, the way `main.tsx` mounts it, instead
// of following Storybook's light/dark toggle.
const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i } },
    docs: {
      canvas: { sourceState: "shown" },
      // Storybook's own docs chrome renders outside the Astryx theme and
      // only takes literal colours, so these approximate the dark theme.
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
      <Theme
        theme={astryxThemes[defaultThemeSlug]}
        mode={themeModes[defaultThemeSlug] ?? "dark"}
      >
        <LayerProvider>
          <VStack padding={6}>
            <Story />
          </VStack>
        </LayerProvider>
      </Theme>
    ),
  ],
};

export default preview;
