import type { StateCreator } from "zustand";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { AppStore } from "./index";

export const DEFAULT_IDE_COMMAND = "code";

export interface IdeSlice {
  // Settings > IDE. The CLI launcher (`code`, `zed`, `code -n`, ...) the
  // title bar's "Open in IDE" button runs with the active checkout path
  // appended — see `commands::open_in_ide`.
  ideCommand: string;
  setIdeCommand: (command: string) => void;
}

export const ideSlice: StateCreator<AppStore, [], [], IdeSlice> = (set) => ({
  ideCommand: localStorage.getItem(LS_KEYS.ideCommand) ?? DEFAULT_IDE_COMMAND,

  setIdeCommand: (command) => {
    localStorage.setItem(LS_KEYS.ideCommand, command);
    set({ ideCommand: command });
  },
});
