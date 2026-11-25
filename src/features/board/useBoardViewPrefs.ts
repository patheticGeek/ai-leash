import { useSyncExternalStore } from "react";
import { LS_KEYS } from "../../lib/localStorageKeys";
import { localStorageJson } from "../../store/localStorageJson";

// How one project's board is filtered and laid out. `epicFilter` is "all",
// "none" (tasks with no epic) or an epic id.
export interface BoardViewPrefs {
  epicFilter: string;
  groupByEpic: boolean;
  showDone: boolean;
  // Whether done tasks older than 30 days are loaded. Kept per project for
  // this session only: it costs a bigger fetch, so a restart starts lean.
  includeOlderDone: boolean;
}

type Persisted = Omit<BoardViewPrefs, "includeOlderDone">;

const DEFAULTS: BoardViewPrefs = {
  epicFilter: "all",
  groupByEpic: false,
  showDone: false,
  includeOlderDone: false,
};

function readAll(): Record<string, Partial<Persisted>> {
  const stored = localStorageJson.read<unknown>(LS_KEYS.boardViewPrefs, {});
  return stored && typeof stored === "object" && !Array.isArray(stored)
    ? (stored as Record<string, Partial<Persisted>>)
    : {};
}

// Persisted prefs by project root, plus this session's `includeOlderDone`.
const persisted = readAll();
const olderDone = new Map<string, boolean>();
const snapshots = new Map<string, BoardViewPrefs>();
const listeners = new Set<() => void>();

function snapshot(root: string): BoardViewPrefs {
  let snap = snapshots.get(root);
  if (!snap) {
    const p = persisted[root] ?? {};
    snap = {
      epicFilter:
        typeof p.epicFilter === "string" ? p.epicFilter : DEFAULTS.epicFilter,
      groupByEpic:
        typeof p.groupByEpic === "boolean"
          ? p.groupByEpic
          : DEFAULTS.groupByEpic,
      showDone:
        typeof p.showDone === "boolean" ? p.showDone : DEFAULTS.showDone,
      includeOlderDone: olderDone.get(root) ?? DEFAULTS.includeOlderDone,
    };
    snapshots.set(root, snap);
  }
  return snap;
}

function update(root: string, patch: Partial<BoardViewPrefs>): void {
  const { includeOlderDone, ...rest } = { ...snapshot(root), ...patch };
  olderDone.set(root, includeOlderDone);
  persisted[root] = rest;
  localStorageJson.write(LS_KEYS.boardViewPrefs, persisted);
  snapshots.delete(root);
  for (const listener of listeners) listener();
}

// The board's epic filter, Group by epic and Show done, remembered per
// project across board switches and restarts (localStorage, like the
// board's layout and collapsed lanes).
export function useBoardViewPrefs(
  projectRoot: string,
): [BoardViewPrefs, (patch: Partial<BoardViewPrefs>) => void] {
  const prefs = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot(projectRoot),
  );
  return [prefs, (patch) => update(projectRoot, patch)];
}
