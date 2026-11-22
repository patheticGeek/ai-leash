import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import {
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { defaultThemeSlug, themeModes, themes } from "../astryx-themes";
import { reportReactError } from "../lib/crashReporting";

const styles = stylex.create({
  screen: {
    width: "100%",
    height: "100%",
    textAlign: "center",
    backgroundColor: colorVars["--color-background-body"],
  },
  message: {
    display: "block",
    maxWidth: "32rem",
    maxHeight: "12rem",
    overflow: "auto",
    padding: spacingVars["--spacing-2"],
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-muted"],
    userSelect: "text",
    whiteSpace: "pre-wrap",
  },
});

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
      // Its own `Theme`: in `main.tsx` this boundary sits outside the app's,
      // so a crash anywhere still gets the leash theme.
      return (
        <Theme
          theme={themes[defaultThemeSlug]}
          mode={themeModes[defaultThemeSlug] ?? "dark"}
        >
          <VStack
            gap={3}
            hAlign="center"
            vAlign="center"
            padding={6}
            xstyle={styles.screen}
          >
            <Text type="label">Something went wrong.</Text>
            <Text type="supporting" size="xsm" color="secondary">
              The error has been logged — open Settings → Crash log to see it,
              or reload to keep working.
            </Text>
            <Text type="code" size="2xs" xstyle={styles.message}>
              {this.state.error.message}
            </Text>
            <Button
              variant="primary"
              size="sm"
              label="Reload"
              icon={<RotateCcw size={13} />}
              onClick={() => window.location.reload()}
            />
          </VStack>
        </Theme>
      );
    }
    return this.props.children;
  }
}
