import type { StateCreator } from "zustand";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { PermissionRequestPayload } from "../lib/tauriApi";
import { api } from "../lib/tauriApi";
import type { ConversationSummary } from "./conversationSlice";
import type { AppStore } from "./index";
import { localStorageJson } from "./localStorageJson";

export type PermissionMode = "ask" | "bypass";

function isPermissionMode(value: unknown): value is PermissionMode {
  return value === "ask" || value === "bypass";
}

// Per-session Ask/Bypass choice for tool-call permission prompts (edits,
// shell commands, ACP's own permission requests) — see the selector next to
// the model picker in `ChatPanel.tsx`. Persisted in `conversations.
// permission_mode` (`db::set_conversation_permission_mode`) so it survives
// an app restart, but the actual enforcement lives backend-side
// (`request_permission` in tools.rs, gated by `AppState.permission_bypass`)
// — that's in-memory only, so `ChatPanel` re-sends whatever's stored here
// once per mount to keep the backend in sync (see `setPermissionMode`'s doc
// comment below).

// Resolves "does this project have a permission request waiting" — an
// exact match (a top-level conversation's own tool call), or a sub-agent
// spawned from it (the backend stamps `parentSessionId` on the request — see
// `PermissionRequest` in permissions.rs), since a sub-agent has no textarea
// of its own to show a popover above. Used by both `ChatPanel.tsx` (to render
// the popover) and `LeftBar.tsx` (to glow the row) so the two never disagree
// about which project a given request belongs to.
export function permissionForSession(
  pending: Record<string, PermissionRequestPayload>,
  sessionId: string,
): PermissionRequestPayload | null {
  if (pending[sessionId]) return pending[sessionId];
  return (
    Object.values(pending).find((p) => p.parentSessionId === sessionId) ?? null
  );
}

export interface PermissionSlice {
  // Per-conversation Ask/Bypass permission choice — see the module doc
  // comment above. Missing entry means "ask" (the default).
  permissionMode: Record<string, PermissionMode>;
  // Keyed by the *exact* session id the request came from — for a sub-agent
  // that's its own id, not its parent's. `permissionForSession` (above) is
  // what resolves "does this project have anything pending", checking both an
  // exact match and any request whose `parentSessionId` is it, since a
  // sub-agent's tool calls have nowhere of their own to surface a popover —
  // they're shown above the *parent* project's textarea instead. One global `permission://request`/
  // `permission://resolved` listener pair maintains this (see
  // `LeftBar.tsx`), same shape as `chat://generating` — one listener total,
  // not one per project, since the backend event itself carries `sessionId`.
  pendingPermissions: Record<string, PermissionRequestPayload>;
  addPendingPermission: (payload: PermissionRequestPayload) => void;
  resolvePendingPermission: (id: string) => void;
  // Persists the choice (in memory here, and to `conversations.
  // permission_mode` via `set_permission_mode`, which also flips the
  // backend's in-memory enforcement flag) — see the module doc comment.
  // `ChatPanel.tsx` also calls this once on mount with whatever's already
  // stored, to re-sync the backend's in-memory state after an app restart.
  setPermissionMode: (sessionId: string, mode: PermissionMode) => void;
  // Drops a deleted conversation's saved Ask/Bypass choice — called by
  // `conversationSlice.deleteConversation`, mirroring
  // `acpSlice.forgetConversationBackend`. Rust already drops the row's own
  // `permission_mode` column as part of deleting the conversation, so this
  // only needs to clear the in-memory map.
  forgetPermissionMode: (sessionId: string) => void;
  // Seeds `permissionMode` from freshly loaded rows, migrating the old
  // localStorage blob for a row that doesn't have a DB value yet — mirrors
  // `acpSlice.hydrateConversationBackendFromRows`.
  hydratePermissionModeFromRows: (rows: ConversationSummary[]) => void;
}

export const permissionSlice: StateCreator<
  AppStore,
  [],
  [],
  PermissionSlice
> = (set, get) => ({
  // Seeded by `hydratePermissionModeFromRows` once conversations load.
  permissionMode: {},
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
    set((s) => ({
      permissionMode: { ...s.permissionMode, [sessionId]: mode },
    }));
    // The in-memory bypass flag must always flip (enforcement can't wait),
    // but persisting is gated on this being a real, listed conversation —
    // `useSessionPermissions.ts` re-sends this on every mount, including a
    // still-unsent "new thread", and that must not leave a row behind just
    // from opening it. `conversations` (not a DB round trip) is the right
    // check here: `conversationSlice.markConversationStarted` flips a
    // thread from unsent to real *before* its first message actually lands
    // in SQLite, and flushes this map's current entry right after — a
    // DB-existence check at that moment would still say "not yet".
    const listed = get().conversations.find((c) => c.id === sessionId);
    const persist = !!listed;
    const projectRoot = listed?.projectRoot ?? get().projectRoot ?? "";
    void api.setPermissionMode(
      sessionId,
      projectRoot,
      mode === "bypass",
      persist,
    );
  },

  forgetPermissionMode: (sessionId) =>
    set((s) => {
      if (!(sessionId in s.permissionMode)) return s;
      const permissionMode = { ...s.permissionMode };
      delete permissionMode[sessionId];
      return { permissionMode };
    }),

  hydratePermissionModeFromRows: (rows) => {
    const legacy = localStorageJson.read<Record<string, unknown>>(
      LS_KEYS.permissionMode,
      {},
    );
    const hasLegacy =
      legacy && typeof legacy === "object" && Object.keys(legacy).length > 0;
    for (const row of rows) {
      if (get().permissionMode[row.id]) continue;
      if (isPermissionMode(row.permissionMode)) {
        const mode = row.permissionMode;
        set((s) => ({
          permissionMode: { ...s.permissionMode, [row.id]: mode },
        }));
        continue;
      }
      if (!hasLegacy) continue;
      const migrated = legacy[row.id];
      if (isPermissionMode(migrated)) get().setPermissionMode(row.id, migrated);
    }
    if (hasLegacy) localStorage.removeItem(LS_KEYS.permissionMode);
  },
});
