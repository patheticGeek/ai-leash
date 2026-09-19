import { useEffect, useRef, useState } from "react";
import type { PanelEntry } from "./useChatStream";

// Once a turn finishes, its elapsed time is frozen here (keyed by the
// finished assistant reply's own index in `entries`) so the reply's footer
// can keep showing "Worked for <time>" instead of reverting to a plain
// timestamp.
//
// `startedAtMs` is anchored to `useGenerating` (a cache entry that outlives
// the component) rather than component-local state, so switching away from
// a conversation and back — a full remount, since `App.tsx` keys `ChatPanel`
// on `activeSessionId` — doesn't reset the clock. The per-second tick itself
// lives in `WorkingForIndicator`, so a turn in flight doesn't re-render the
// whole panel every second. Duration *persistence* (`api.setMessageDuration`)
// lives in the always-mounted `useGeneratingListener` (`generatingQuery.ts`),
// so it still happens for a turn that finishes while a different
// conversation is open.
export function useTurnDurations(
  entries: PanelEntry[],
  sending: boolean,
  startedAtMs: number | null,
): Record<number, number> {
  const [turnDurations, setTurnDurations] = useState<Record<number, number>>(
    {},
  );
  // Mirrors the last non-null `startedAtMs` — the query entry itself flips to
  // `null` the same render `active` goes false, one render before `sending`
  // is observed false, so the freeze effect needs this ref to still see the
  // real start time by the time it runs.
  const startedAtMsRef = useRef<number | null>(null);
  useEffect(() => {
    if (startedAtMs != null) startedAtMsRef.current = startedAtMs;
  }, [startedAtMs]);
  // A ref because the freeze effect only fires on the `sending` transition
  // and needs whatever `entries` were current *at that moment*, not whatever
  // they were when the effect was last set up.
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Seeds `turnDurations` from history loaded off disk (see
  // `messagesToEntries`) so a reply's "Worked for <time>" footer survives an
  // app restart instead of falling back to a plain timestamp — only fills in
  // indices not already set, since a turn that just finished live already
  // has its duration in state from the effect below.
  useEffect(() => {
    setTurnDurations((prev) => {
      let changed = false;
      const next = { ...prev };
      entries.forEach((e, i) => {
        if (
          e.kind === "text" &&
          e.role === "assistant" &&
          e.durationSeconds != null &&
          next[i] === undefined
        ) {
          next[i] = e.durationSeconds;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [entries]);

  useEffect(() => {
    if (sending) return;
    const startedAt = startedAtMsRef.current;
    if (!startedAt) return;
    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    const list = entriesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.kind === "text" && e.role === "assistant") {
        setTurnDurations((prev) => ({ ...prev, [i]: seconds }));
        break;
      }
      if (e.kind === "text" && e.role === "user") break;
    }
    startedAtMsRef.current = null;
  }, [sending]);

  return turnDurations;
}
