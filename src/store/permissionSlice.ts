import type { StateCreator } from "zustand";
import type { PermissionRequestPayload } from "../lib/tauriApi";
import { api } from "../lib/tauriApi";
import type { AppStore } from "./index";

const PERMISSION_MODE_KEY = "ai-leash:permissionMode";

export type PermissionMode = "ask" | "bypass";

// Per-session Ask/Bypass choice for tool-call permission prompts (edits,
// shell commands, ACP's own permission requests) — see the selector next to
// the model picker in `ChatPanel.tsx`. Persisted here so it survives an app
// restart, but the actual enforcement lives backend-side (`request_permission`
// in tools.rs, gated by `AppState.permission_bypass`) — that's in-memory
// only, so `ChatPanel` re-sends whatever's stored here once per mount to
// keep the backend in sync (see `setPermissionMode`'s doc comment below).
function loadPermissionMode(): Record<string, PermissionMode> {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(PERMISSION_MODE_KEY) ?? "{}",
    );
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // fall through
  }
  return {};
}

function savePermissionModeMap(map: Record<string, PermissionMode>) {
  localStorage.setItem(PERMISSION_MODE_KEY, JSON.stringify(map));
}

// Resolves "does this project have a permission request waiting" — an
// exact match (a top-level conversation's own tool call), or a sub-agent
// spawned from it (`{sessionId}::spawn_sub_agent::{uuid}`, see
// `spawn_sub_agent` in tools.rs), since a sub-agent has no textarea of its
// own to show a popover above. Used by both `ChatPanel.tsx` (to render the
// popover) and `LeftBar.tsx` (to glow the row) so the two never disagree
// about which project a given request belongs to.
export function permissionForSession(
  pending: Record<string, PermissionRequestPayload>,
  sessionId: string,
): PermissionRequestPayload | null {
  if (pending[sessionId]) return pending[sessionId];
  const childPrefix = `${sessionId}::spawn_sub_agent::`;
  return (
    Object.values(pending).find((p) => p.sessionId.startsWith(childPrefix)) ??
    null
  );
}

export interface PermissionSlice {
  // Per-conversation Ask/Bypass permission choice — see `loadPermissionMode`'s
  // doc comment. Missing entry means "ask" (the default).
  permissionMode: Record<string, PermissionMode>;
  // Keyed by the *exact* session id the request came from — for a sub-agent
  // that's its own synthetic `{parentSessionId}::spawn_sub_agent::{uuid}`
  // id, not its parent's. `permissionForSession` (above) is what resolves
  // "does this project have anything pending", checking both an exact match
  // and any child sub-agent id, since a sub-agent's tool calls have nowhere
  // of their own to surface a popover — they're shown above the *parent*
  // project's textarea instead. One global `permission://request`/
  // `permission://resolved` listener pair maintains this (see
  // `LeftBar.tsx`) — unlike `generatingSessions`, no per-project listener
  // is needed since the backend event itself now carries `sessionId`.
  pendingPermissions: Record<string, PermissionRequestPayload>;
  addPendingPermission: (payload: PermissionRequestPayload) => void;
  resolvePendingPermission: (id: string) => void;
  // Persists the choice locally and pushes it to the backend
  // (`set_permission_mode`) so `request_permission` actually honors it —
  // see `loadPermissionMode`'s doc comment. `ChatPanel.tsx` also calls this
  // once on mount with whatever's already stored, to re-sync the backend's
  // in-memory state after an app restart.
  setPermissionMode: (sessionId: string, mode: PermissionMode) => void;
}

export const permissionSlice: StateCreator<
  AppStore,
  [],
  [],
  PermissionSlice
> = (set) => ({
  permissionMode: loadPermissionMode(),
  pendingPermissions: {},

  addPendingPermission: (payload) =>
    set((s) => ({
      pendingPermissions: {
        ...s.pendingPermissions,
        [payload.sessionId]: payload,
      },
    })),

  resolvePendingPermission: (id) =>
    set((s) => {
      const entry = Object.entries(s.pendingPermissions).find(
        ([, p]) => p.id === id,
      );
      if (!entry) return s;
      const pendingPermissions = { ...s.pendingPermissions };
      delete pendingPermissions[entry[0]];
      return { pendingPermissions };
    }),

  setPermissionMode: (sessionId, mode) => {
    set((s) => {
      const permissionMode = { ...s.permissionMode, [sessionId]: mode };
      savePermissionModeMap(permissionMode);
      return { permissionMode };
    });
    void api.setPermissionMode(sessionId, mode === "bypass");
  },
});
