import { useSyncExternalStore } from "react";
import { LS_KEYS } from "../../lib/localStorageKeys";

// What a project's board view shows: just the board, just its project
// chat, or both side by side. One app-wide choice, remembered across
// restarts — per-window layout, so localStorage rather than Rust.
export type BoardLayout = "board" | "both" | "chat";

function read(): BoardLayout {
  const stored = localStorage.getItem(LS_KEYS.boardLayout);
  return stored === "board" || stored === "chat" ? stored : "both";
}

let current = read();
const listeners = new Set<() => void>();

export function setBoardLayout(layout: BoardLayout): void {
  current = layout;
  localStorage.setItem(LS_KEYS.boardLayout, layout);
  for (const listener of listeners) listener();
}

export function useBoardLayout(): BoardLayout {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
