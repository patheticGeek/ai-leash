import { RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportReactError } from "../lib/crashReporting";
import Button from "./Button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// A render-time crash anywhere in the tree would otherwise just white-screen
// the whole app with nothing on screen to explain why. This catches it,
// reports it to the same backend crash log a panic writes to (see
// `crashReporting.ts`/`crashlog.rs`), and shows a fallback with a way to get
// back to a working state instead of a blank window.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportReactError(
      error.message,
      error.stack ?? info.componentStack ?? undefined,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[#0e0f12] text-zinc-300">
          <div className="text-sm font-medium text-zinc-100">
            Something went wrong.
          </div>
          <div className="max-w-md text-center text-xs text-zinc-500">
            The error has been logged — open Settings → Crash log to see it, or
            reload to keep working.
          </div>
          <pre className="max-w-lg select-text overflow-auto rounded-md bg-[#141518] p-2 text-[10px] text-zinc-600 shadow-[var(--al-shadow)]">
            {this.state.error.message}
          </pre>
          <Button
            variant="primary"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RotateCcw size={13} />
            Reload
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
