import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: "@storybook/react-vite",
  // The app's vite.config.ts pins a strict Tauri dev-server port (1420) and
  // HMR host — Storybook runs its own server, so drop those.
  viteFinal: (config) => ({
    ...config,
    server: {
      ...config.server,
      port: undefined,
      strictPort: false,
      hmr: undefined,
    },
  }),
};

export default config;
