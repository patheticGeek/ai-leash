// First: declares the cascade-layer order every other stylesheet lands in.
import "./index.css";
import { LayerProvider } from "@astryxdesign/core/Layer";
import { Theme } from "@astryxdesign/core/theme";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { defaultThemeSlug, themeModes, themes } from "./astryx-themes";
import { bootBackends } from "./data/backends";
import { bootPreferences } from "./data/preferences";
import { installCrashReporting } from "./lib/crashReporting";
import { installFontPreferences } from "./lib/fontPreferences";
import { queryClient } from "./lib/queryClient";
import ErrorBoundary from "./ui/ErrorBoundary";

installCrashReporting();

// Preferences live in Rust; load them first so the first paint already has the
// saved fonts and toggles.
// Same for the backend registry, so the chat bar never renders without it.
await Promise.all([bootPreferences(), bootBackends()]);
installFontPreferences();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* Renders a `display: contents` wrapper, so layout is untouched. */}
      <Theme
        theme={themes[defaultThemeSlug]}
        mode={themeModes[defaultThemeSlug] ?? "dark"}
      >
        <QueryClientProvider client={queryClient}>
          {/* The app-wide layer context: `useToast()` toasts land in its one
              ToastViewport, at the Astryx default bottom-end. */}
          <LayerProvider>
            <App />
          </LayerProvider>
          {/* Renders null whenever NODE_ENV !== "development" (the package's
              own internal check), so this doesn't need an env guard here. */}
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </Theme>
    </ErrorBoundary>
  </React.StrictMode>,
);
