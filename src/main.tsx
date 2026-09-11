import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { installCrashReporting } from "./lib/crashReporting";
import ErrorBoundary from "./ui/ErrorBoundary";
import "./index.css";

installCrashReporting();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
