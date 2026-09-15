import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { installCrashReporting } from "./lib/crashReporting";
import ErrorBoundary from "./ui/ErrorBoundary";
import "./index.css";

installCrashReporting();

// Live/pushed data (git branch, actions, generating status, ...) is written
// into the query cache directly from Tauri event handlers rather than via
// refetch, so a long `staleTime` just means "don't refetch on refocus/mount
// if we already have a value" — freshness for that data comes from the
// event, not from React Query's own refetch heuristics.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

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
