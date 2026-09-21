import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { queryClient } from "../lib/queryClient";
import { api, type Preferences } from "../lib/tauriApi";
import { qk } from "./keys";

// UI bounds and the size the font scale is measured against. Rust
// (`preferences.rs`) owns the real defaults and clamps every write, so keep
// these in step with it — they only shape the inputs, never the stored value.
export const DEFAULT_IDE_COMMAND = "code";
export const DEFAULT_UI_FONT_SIZE = 16;
export const DEFAULT_CODE_FONT_SIZE = 12;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;
// The chat box starts 3 lines tall and grows with its text up to
// `composerMaxRows` before it scrolls.
export const COMPOSER_MIN_ROWS = 3;
export const DEFAULT_COMPOSER_MAX_ROWS = 6;
export const MAX_COMPOSER_MAX_ROWS = 12;

const SET_MUTATION_KEY = ["preferences", "set"] as const;

// Seeded by `bootPreferences` before the first render and only ever changed
// by this app's own writes, so it never goes stale or gets collected.
function usePreferencesSelect<T>(select: (preferences: Preferences) => T): T {
  const { data } = useQuery({
    queryKey: qk.preferences,
    queryFn: () => api.getPreferences().then((s) => s.preferences),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    select,
  });
  if (data === undefined) {
    throw new Error("preferences were read before bootPreferences() ran");
  }
  return data;
}

/** One preference, re-rendering only when that field changes. */
export function usePreference<K extends keyof Preferences>(
  key: K,
): Preferences[K] {
  return usePreferencesSelect((p) => p[key]);
}

/**
 * Returns a stable `set(patch)`. The cache updates immediately; writes are
 * serialized (one `scope`) so a burst of keystrokes lands in order, and the
 * clamped value Rust returns replaces the guess once the last one finishes.
 */
export function useSetPreferences(): (patch: Partial<Preferences>) => void {
  const { mutate } = useMutation({
    mutationKey: SET_MUTATION_KEY,
    scope: { id: "preferences" },
    mutationFn: (patch: Partial<Preferences>) => api.setPreferences(patch),
    onSuccess: (next) => {
      // Only this write is still pending: no newer optimistic value to clobber.
      if (queryClient.isMutating({ mutationKey: SET_MUTATION_KEY }) <= 1) {
        queryClient.setQueryData(qk.preferences, next);
      }
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: qk.preferences });
    },
  });
  // Optimistic update runs synchronously here rather than in `onMutate`
  // (which runs a tick later): a controlled text input fed by an async cache
  // write loses its cursor position.
  return useCallback(
    (patch: Partial<Preferences>) => {
      queryClient.setQueryData<Preferences>(qk.preferences, (old) =>
        old ? { ...old, ...patch } : old,
      );
      mutate(patch);
    },
    [mutate],
  );
}

/** For code outside React (xterm setup). Only valid after `bootPreferences`. */
export function getPreferences(): Preferences {
  const preferences = queryClient.getQueryData<Preferences>(qk.preferences);
  if (!preferences) {
    throw new Error("preferences were read before bootPreferences() ran");
  }
  return preferences;
}

/** Calls `listener` with the new and previous value on every change. */
export function subscribePreferences(
  listener: (next: Preferences, prev: Preferences) => void,
): () => void {
  let prev = getPreferences();
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] !== qk.preferences[0]) return;
    const next = event.query.state.data as Preferences | undefined;
    if (!next || next === prev) return;
    const before = prev;
    prev = next;
    listener(next, before);
  });
}

// The localStorage keys preferences used before they moved to Rust. Only
// read here, once, to carry an existing user's values over.
const LEGACY_KEYS = {
  composeMode: "ai-leash:composeMode",
  composerMaxRows: "ai-leash:composerMaxRows",
  ideCommand: "ai-leash:ideCommand",
  debugModeEnabled: "ai-leash:debugModeEnabled",
  debugShowIds: "ai-leash:debugShowIds",
  uiFontFamily: "ai-leash:uiFontFamily",
  uiFontSize: "ai-leash:uiFontSize",
  codeFontFamily: "ai-leash:codeFontFamily",
  codeFontSize: "ai-leash:codeFontSize",
} as const satisfies Record<keyof Preferences, string>;

function readLegacyPreferences(): Partial<Preferences> | null {
  const patch: Record<string, string | number | boolean> = {};
  for (const [field, key] of Object.entries(LEGACY_KEYS)) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    if (field === "composeMode" || field.startsWith("debug")) {
      patch[field] = raw === "1";
    } else if (field.endsWith("Size") || field === "composerMaxRows") {
      const n = Number(raw);
      if (Number.isFinite(n)) patch[field] = n;
    } else {
      patch[field] = raw;
    }
  }
  return Object.keys(patch).length > 0 ? (patch as Partial<Preferences>) : null;
}

/**
 * Loads preferences from Rust into the query cache. Awaited before the first
 * render (`main.tsx`) so fonts and toggles are right from the first paint.
 * On the first launch of a build that stores them in Rust, values still in
 * localStorage are copied over once and then removed.
 */
export async function bootPreferences(): Promise<void> {
  const snapshot = await api.getPreferences();
  let preferences = snapshot.preferences;
  if (!snapshot.persisted) {
    const legacy = readLegacyPreferences();
    if (legacy) {
      preferences = await api.setPreferences(legacy);
      for (const key of Object.values(LEGACY_KEYS)) {
        localStorage.removeItem(key);
      }
    }
  }
  queryClient.setQueryData(qk.preferences, preferences);
}
