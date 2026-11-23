import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Same StyleX prefix as the app: keeps our atomic classes from colliding
// with Astryx's prebuilt ones.
export default defineConfig({
  plugins: [stylex.vite({ classNamePrefix: "al" }), react()],
  server: { port: 5199, strictPort: true },
});
