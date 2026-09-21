import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { bootPreferences } from "./data/preferences";
import { installCrashReporting } from "./lib/crashReporting";
import { installFontPreferences } from "./lib/fontPreferences";
import { queryClient } from "./lib/queryClient";
import ErrorBoundary from "./ui/ErrorBoundary";
import "./index.css";

installCrashReporting();

// Preferences live in Rust; load them first so the first paint already has the
// saved fonts and toggles.
await bootPreferences();
installFontPreferences();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        {/* Renders null whenever NODE_ENV !== "development" (the package's
            own internal check), so this doesn't need an env guard here. */}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
