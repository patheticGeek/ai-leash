// @ts-expect-error type error without @types/node package
import { execSync } from "node:child_process";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

function commitHash() {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

// https://vite.dev/config/
export default defineConfig(() => ({
  // StyleX compiles our own `stylex.create()` styles only. Astryx itself is
  // prebuilt (`@astryxdesign/core/astryx.css`) and never goes through it.
  // `classNamePrefix`: StyleX names atomic classes by hashing property+value,
  // so with the default "x" prefix our `backgroundColor: "transparent"`
  // compiles to the very class Astryx's prebuilt CSS uses for the same
  // declaration. Ours is emitted unlayered, so it would lift every Astryx
  // element using that class above the `astryx-theme` layer and silently
  // undo theme component overrides. A prefix of our own keeps them apart.
  plugins: [stylex.vite({ classNamePrefix: "al" }), react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash()),
    // "pr" for a CI build off a pull request (see build.yml), "" otherwise
    // (a release build, or a plain local `npm run build`) — see
    // src/lib/buildChannel.ts for how this becomes the dev/PR badge.
    __BUILD_CHANNEL__: JSON.stringify(process.env.AI_LEASH_BUILD_CHANNEL ?? ""),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri` (and the standalone
      // UI prototype, which has its own Vite app)
      ignored: ["**/src-tauri/**", "**/prototype/**"],
    },
  },
}));
