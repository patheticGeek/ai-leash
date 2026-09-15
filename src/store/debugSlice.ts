import type { StateCreator } from "zustand";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { AppStore } from "./index";

export interface AcpDebugEvent {
  id: number;
  /** AI Leash's own conversation id — the ACP protocol's own session id
   * (assigned by the agent, distinct from this) shows up inside individual
   * events' payloads instead, see `latestAcpSessionId` in
   * `DebugEventsPanel.tsx`. */
  sessionId: string;
  direction: "received" | "sent";
  event: string;
  payload: unknown;
  receivedAt: number;
}

// Capped so leaving debug mode on for a long-running session doesn't grow
// this without bound — old events roll off the front once the cap is hit.
const MAX_DEBUG_EVENTS = 2000;

let nextDebugEventId = 0;

function readBool(key: string): boolean {
  return localStorage.getItem(key) === "1";
}

export interface DebugSlice {
  // Settings > Debug toggle. Gates both event capture (see
  // `useDebugEventCapture.ts`) and whether the floating devtools icon
  // renders at all — off by default, so most users never pay for either.
  debugModeEnabled: boolean;
  // Settings > Debug toggle for showing "project / conversation / session"
  // ids in the title bar's center section.
  debugShowIds: boolean;
  // Only the devtools icon vs. panel visibility — independent of whether
  // events are being captured, so closing the panel never drops anything
  // (per the ask: open/close shouldn't lose events, only turning debug
  // mode off entirely does).
  debugPanelOpen: boolean;
  debugEvents: AcpDebugEvent[];
  setDebugModeEnabled: (enabled: boolean) => void;
  setDebugShowIds: (enabled: boolean) => void;
  setDebugPanelOpen: (open: boolean) => void;
  addDebugEvent: (event: Omit<AcpDebugEvent, "id" | "receivedAt">) => void;
  clearDebugEvents: () => void;
}

export const debugSlice: StateCreator<AppStore, [], [], DebugSlice> = (
  set,
) => ({
  debugModeEnabled: readBool(LS_KEYS.debugModeEnabled),
  debugShowIds: readBool(LS_KEYS.debugShowIds),
  debugPanelOpen: false,
  debugEvents: [],

  setDebugModeEnabled: (enabled) => {
    localStorage.setItem(LS_KEYS.debugModeEnabled, enabled ? "1" : "0");
    // Turning debug mode off stops capture and drops whatever was
    // collected — nothing here is meant to outlive the toggle itself.
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
  setDebugPanelOpen: (open) => set({ debugPanelOpen: open }),
  addDebugEvent: (event) => {
    set((s) => {
      const next = [
        ...s.debugEvents,
        { ...event, id: nextDebugEventId++, receivedAt: Date.now() },
      ];
      return {
        debugEvents:
          next.length > MAX_DEBUG_EVENTS
            ? next.slice(next.length - MAX_DEBUG_EVENTS)
            : next,
      };
    });
  },
  clearDebugEvents: () => set({ debugEvents: [] }),
});
