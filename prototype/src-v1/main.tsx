import "./index.css";
import { Theme } from "@astryxdesign/core/theme";
import React from "react";
import ReactDOM from "react-dom/client";
import { defaultThemeSlug, themeModes, themes } from "./astryx-themes";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Theme
      theme={themes[defaultThemeSlug]}
      mode={themeModes[defaultThemeSlug] ?? "dark"}
    >
      <App />
    </Theme>
  </React.StrictMode>,
);
