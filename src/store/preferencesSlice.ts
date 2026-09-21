import type { StateCreator } from "zustand";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { AppStore } from "./index";

export const DEFAULT_IDE_COMMAND = "code";

// Sizes are px. The UI size is the root text size (`text-base`); every other
// Tailwind text size scales proportionally with it — see `fontPreferences.ts`.
export const DEFAULT_UI_FONT_SIZE = 16;
export const DEFAULT_CODE_FONT_SIZE = 12;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;

// The chat box starts 3 lines tall and grows with its text up to this many
// lines before it scrolls; the preference is that upper bound.
export const COMPOSER_MIN_ROWS = 3;
export const DEFAULT_COMPOSER_MAX_ROWS = 6;
export const MAX_COMPOSER_MAX_ROWS = 12;

function readComposerMaxRows(): number {
  const n = Number(localStorage.getItem(LS_KEYS.composerMaxRows));
  return Number.isInteger(n) &&
    n >= COMPOSER_MIN_ROWS &&
    n <= MAX_COMPOSER_MAX_ROWS
    ? n
    : DEFAULT_COMPOSER_MAX_ROWS;
}

function readSize(key: string, fallback: number): number {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE
    ? n
    : fallback;
}

function readBool(key: string): boolean {
  return localStorage.getItem(key) === "1";
}

export interface PreferencesSlice {
  // Settings > Preferences. When on, the chat box sends on Ctrl+Enter and
  // a plain Enter inserts a newline — see `ChatComposer`'s `onKeyDown`.
  composeMode: boolean;
  setComposeMode: (enabled: boolean) => void;
  // Settings > Preferences > Chat. Most lines the chat box grows to before
  // it scrolls (`COMPOSER_MIN_ROWS`..`MAX_COMPOSER_MAX_ROWS`).
  composerMaxRows: number;
  setComposerMaxRows: (rows: number) => void;
  // Settings > Preferences > IDE. The CLI launcher (`code`, `zed`, `code -n`,
  // ...) the title bar's "Open in IDE" button runs with the active checkout
  // path appended — see `commands::open_in_ide`.
  ideCommand: string;
  setIdeCommand: (command: string) => void;
  // Settings > Preferences > Debug. Gates both event capture (see
  // `useDebugEventCapture.ts`) and whether the floating devtools icon
  // renders at all — off by default, so most users never pay for either.
  debugModeEnabled: boolean;
  setDebugModeEnabled: (enabled: boolean) => void;
  // Shows "project / conversation / session" ids in the title bar's center
  // section.
  debugShowIds: boolean;
  setDebugShowIds: (enabled: boolean) => void;
  // Settings > Preferences > Fonts. A family is a CSS `font-family` list put
  // ahead of the built-in stack ("" = built-in only); "UI" is interface
  // text, "code" is monospace text (code blocks, tool output, terminals,
  // the file editor).
  uiFontFamily: string;
  uiFontSize: number;
  codeFontFamily: string;
  codeFontSize: number;
  setUiFontFamily: (family: string) => void;
  setUiFontSize: (size: number) => void;
  setCodeFontFamily: (family: string) => void;
  setCodeFontSize: (size: number) => void;
}

export const preferencesSlice: StateCreator<
  AppStore,
  [],
  [],
  PreferencesSlice
> = (set) => ({
  composeMode: readBool(LS_KEYS.composeMode),
  composerMaxRows: readComposerMaxRows(),
  ideCommand: localStorage.getItem(LS_KEYS.ideCommand) ?? DEFAULT_IDE_COMMAND,
  debugModeEnabled: readBool(LS_KEYS.debugModeEnabled),
  debugShowIds: readBool(LS_KEYS.debugShowIds),
  uiFontFamily: localStorage.getItem(LS_KEYS.uiFontFamily) ?? "",
  uiFontSize: readSize(LS_KEYS.uiFontSize, DEFAULT_UI_FONT_SIZE),
  codeFontFamily: localStorage.getItem(LS_KEYS.codeFontFamily) ?? "",
  codeFontSize: readSize(LS_KEYS.codeFontSize, DEFAULT_CODE_FONT_SIZE),

  setComposeMode: (enabled) => {
    localStorage.setItem(LS_KEYS.composeMode, enabled ? "1" : "0");
    set({ composeMode: enabled });
  },
  setComposerMaxRows: (rows) => {
    localStorage.setItem(LS_KEYS.composerMaxRows, String(rows));
    set({ composerMaxRows: rows });
  },
  setIdeCommand: (command) => {
    localStorage.setItem(LS_KEYS.ideCommand, command);
    set({ ideCommand: command });
  },
  setDebugModeEnabled: (enabled) => {
    localStorage.setItem(LS_KEYS.debugModeEnabled, enabled ? "1" : "0");
    // Turning debug mode off stops capture and drops whatever was
    // collected (`debugSlice`'s panel and events) — nothing there is meant
    // to outlive the toggle itself.
    set(
      enabled
        ? { debugModeEnabled: true }
        : { debugModeEnabled: false, debugPanelOpen: false, debugEvents: [] },
    );
  },
  setDebugShowIds: (enabled) => {
    localStorage.setItem(LS_KEYS.debugShowIds, enabled ? "1" : "0");
    set({ debugShowIds: enabled });
  },
  setUiFontFamily: (family) => {
    localStorage.setItem(LS_KEYS.uiFontFamily, family);
    set({ uiFontFamily: family });
  },
  setUiFontSize: (size) => {
    localStorage.setItem(LS_KEYS.uiFontSize, String(size));
    set({ uiFontSize: size });
  },
  setCodeFontFamily: (family) => {
    localStorage.setItem(LS_KEYS.codeFontFamily, family);
    set({ codeFontFamily: family });
  },
  setCodeFontSize: (size) => {
    localStorage.setItem(LS_KEYS.codeFontSize, String(size));
    set({ codeFontSize: size });
  },
});
