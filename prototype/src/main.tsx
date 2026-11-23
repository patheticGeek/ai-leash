import "./index.css";
import { Theme } from "@astryxdesign/core/theme";
import { ToastViewport } from "@astryxdesign/core/Toast";
import React from "react";
import ReactDOM from "react-dom/client";
import { defaultThemeSlug, themes } from "./astryx-themes";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Theme theme={themes[defaultThemeSlug]} mode="dark">
      {/* Toasts top-end, under the title bar: the bottom-end default sits on
          the composer's send/stop corner. */}
      <ToastViewport position="topEnd" inset={{ top: 52 }}>
        <App />
      </ToastViewport>
    </Theme>
  </React.StrictMode>,
);
