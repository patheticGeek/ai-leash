import type { StateCreator } from "zustand";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { AppStore } from "./index";

// Sizes are px. The UI size is the root text size (`text-base`); every other
// Tailwind text size scales proportionally with it — see `fontPreferences.ts`.
export const DEFAULT_UI_FONT_SIZE = 16;
export const DEFAULT_CODE_FONT_SIZE = 13;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;

function readSize(key: string, fallback: number): number {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE
    ? n
    : fallback;
}

export interface PreferencesSlice {
  // Settings > Preferences. When on, the chat box sends on Ctrl+Enter and
  // a plain Enter inserts a newline — see `ChatComposer`'s `onKeyDown`.
  composeMode: boolean;
  setComposeMode: (enabled: boolean) => void;
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
  composeMode: localStorage.getItem(LS_KEYS.composeMode) === "1",
  uiFontFamily: localStorage.getItem(LS_KEYS.uiFontFamily) ?? "",
  uiFontSize: readSize(LS_KEYS.uiFontSize, DEFAULT_UI_FONT_SIZE),
  codeFontFamily: localStorage.getItem(LS_KEYS.codeFontFamily) ?? "",
  codeFontSize: readSize(LS_KEYS.codeFontSize, DEFAULT_CODE_FONT_SIZE),

  setComposeMode: (enabled) => {
    localStorage.setItem(LS_KEYS.composeMode, enabled ? "1" : "0");
    set({ composeMode: enabled });
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
