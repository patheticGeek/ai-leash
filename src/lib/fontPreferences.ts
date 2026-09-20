import type { Terminal } from "@xterm/xterm";
import { useAppStore } from "../store";
import { DEFAULT_UI_FONT_SIZE } from "../store/preferencesSlice";

// The built-in stacks, also what `index.css` falls back to before this runs.
export const DEFAULT_SANS_STACK =
  '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif';
export const DEFAULT_MONO_STACK =
  '"JetBrains Mono Variable", "JetBrains Mono", "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace';

// A user's family goes ahead of the built-in stack so a missing font (or a
// typo) degrades to the default look. One that isn't a valid `font-family`
// list would poison the whole declaration, so it's dropped.
export function fontStack(custom: string, fallback: string): string {
  const trimmed = custom.trim();
  if (!trimmed || !CSS.supports("font-family", trimmed)) return fallback;
  return `${trimmed}, ${fallback}`;
}

function apply() {
  const s = useAppStore.getState();
  const style = document.documentElement.style;
  style.setProperty(
    "--al-font-sans",
    fontStack(s.uiFontFamily, DEFAULT_SANS_STACK),
  );
  style.setProperty(
    "--al-font-mono",
    fontStack(s.codeFontFamily, DEFAULT_MONO_STACK),
  );
  style.setProperty(
    "--al-font-scale",
    String(s.uiFontSize / DEFAULT_UI_FONT_SIZE),
  );
  style.setProperty("--al-code-size", `${s.codeFontSize}px`);
}

// Mirrors the font preferences onto CSS variables on <html> (consumed in
// `index.css`), now and on every change. Called before first render so the
// saved fonts never flash the defaults.
export function installFontPreferences() {
  apply();
  useAppStore.subscribe((s, prev) => {
    if (
      s.uiFontFamily !== prev.uiFontFamily ||
      s.uiFontSize !== prev.uiFontSize ||
      s.codeFontFamily !== prev.codeFontFamily ||
      s.codeFontSize !== prev.codeFontSize
    ) {
      apply();
    }
  });
}

// Keeps a live xterm in step with the code font preferences. `refit` should
// re-fit the terminal and tell its PTY the new size, since a different font
// changes the column/row count without the container itself resizing.
// Returns the unsubscribe.
export function watchTerminalFonts(
  term: Terminal,
  refit: () => void,
): () => void {
  return useAppStore.subscribe((s, prev) => {
    if (
      s.codeFontFamily === prev.codeFontFamily &&
      s.codeFontSize === prev.codeFontSize
    ) {
      return;
    }
    term.options.fontFamily = fontStack(s.codeFontFamily, DEFAULT_MONO_STACK);
    term.options.fontSize = s.codeFontSize;
    refit();
  });
}
