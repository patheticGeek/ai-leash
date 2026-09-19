import type { StateCreator } from "zustand";
import type { ElicitationRequestPayload } from "../lib/tauriApi";
import type { AppStore } from "./index";

// The oldest form still open for `sessionId`, if any. An agent may have
// several outstanding at once, so unlike permissions (one slot per session)
// these are keyed by request id and answered one at a time, oldest first.
// Used by both `ChatComposer` (to render the form) and `LeftBar` (to glow
// the row) so the two never disagree about which project is being asked.
export function elicitationForSession(
  pending: Record<string, ElicitationRequestPayload>,
  sessionId: string,
): ElicitationRequestPayload | null {
  return Object.values(pending).find((p) => p.sessionId === sessionId) ?? null;
}

export interface ElicitationSlice {
  // Keyed by request id; insertion order is arrival order. One global
  // `elicitation://request`/`elicitation://resolved` listener pair maintains
  // this (see `LeftBar.tsx`), same shape as `pendingPermissions`.
  pendingElicitations: Record<string, ElicitationRequestPayload>;
  addPendingElicitation: (payload: ElicitationRequestPayload) => void;
  resolvePendingElicitation: (id: string) => void;
}

export const elicitationSlice: StateCreator<
  AppStore,
  [],
  [],
  ElicitationSlice
> = (set) => ({
  pendingElicitations: {},

  addPendingElicitation: (payload) =>
    set((s) => ({
      pendingElicitations: { ...s.pendingElicitations, [payload.id]: payload },
    })),

  resolvePendingElicitation: (id) =>
    set((s) => {
      if (!(id in s.pendingElicitations)) return s;
      const pendingElicitations = { ...s.pendingElicitations };
      delete pendingElicitations[id];
      return { pendingElicitations };
    }),
});
