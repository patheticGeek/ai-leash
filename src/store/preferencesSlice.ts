import type { StateCreator } from "zustand";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { AppStore } from "./index";

export interface PreferencesSlice {
  // Settings > Preferences. When on, the chat box sends on Ctrl+Enter and
  // a plain Enter inserts a newline — see `ChatComposer`'s `onKeyDown`.
  composeMode: boolean;
  setComposeMode: (enabled: boolean) => void;
}

export const preferencesSlice: StateCreator<
  AppStore,
  [],
  [],
  PreferencesSlice
> = (set) => ({
  composeMode: localStorage.getItem(LS_KEYS.composeMode) === "1",

  setComposeMode: (enabled) => {
    localStorage.setItem(LS_KEYS.composeMode, enabled ? "1" : "0");
    set({ composeMode: enabled });
  },
});
