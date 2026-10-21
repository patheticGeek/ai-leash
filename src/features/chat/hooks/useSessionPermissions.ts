import { useEffect } from "react";
import { api } from "../../../lib/tauriApi";
import { permissionForSession, useAppStore } from "../../../store";
import type { PermissionMode } from "../../../store/permissionSlice";

// This conversation's Ask/Bypass permission mode plus whichever permission
// request (its own or a spawned sub-agent's) is currently waiting on an
// answer. `agentModes`: the agent advertises modes of its own, which the
// permission picker shows instead — Ask/Bypass is then not in effect.
export function useSessionPermissions(
  sessionId: string | null,
  agentModes: boolean,
  setError: (message: string | null) => void,
) {
  // Ask/Bypass permission mode — see `setPermissionMode`'s doc comment in
  // the store. Enforcement is backend-side and in-memory only, so this
  // pushes whatever's already stored down to it once per mount (the panel
  // remounts per conversation — see `App.tsx`'s `key={viewEpoch}`) to
  // restore it after an app restart. A still-unsent new thread (`sessionId`
  // null) keeps its pick in `draft.permissionMode` and tells the backend
  // nothing until its first message (`promoteDraft` carries it over).
  const permissionMode = useAppStore(
    (s) =>
      (sessionId ? s.permissionMode[sessionId] : s.draft?.permissionMode) ??
      "ask",
  );
  const setPermissionMode = useAppStore((s) => s.setPermissionMode);
  const setDraftPermissionMode = useAppStore((s) => s.setDraftPermissionMode);
  // While the agent's own modes are in charge, a saved Bypass must not keep
  // auto-approving behind a picker that no longer shows it — the backend
  // flag goes to "ask" without touching the saved choice, which comes back
  // if the conversation switches to a backend without modes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only re-sync (see comment above) — must not re-fire when permissionMode itself changes
  useEffect(() => {
    if (!sessionId) return;
    if (agentModes) {
      void api.setPermissionMode(sessionId, "", false, false);
    } else {
      setPermissionMode(sessionId, permissionMode);
    }
  }, [sessionId, agentModes]);

  // Resolves to a real request only while this project (or a sub-agent it
  // spawned) has one pending — see `permissionForSession`. Global listeners
  // that populate `pendingPermissions` live in `LeftBar.tsx`, always mounted
  // regardless of which project is currently open, same pattern as
  // `useGeneratingListener`.
  const pendingPermissions = useAppStore((s) => s.pendingPermissions);
  const resolvePendingPermission = useAppStore(
    (s) => s.resolvePendingPermission,
  );
  const pendingPermission = sessionId
    ? permissionForSession(pendingPermissions, sessionId)
    : null;

  // Clears the popover immediately (optimistic — no round-trip flicker)
  // rather than waiting for the backend's own `permission://resolved`, which
  // still fires regardless and is what makes this safe even when a
  // sub-agent's request got answered from its *parent's* popover instance.
  async function respondPermission(approved: boolean) {
    if (!pendingPermission) return;
    const id = pendingPermission.id;
    resolvePendingPermission(id);
    try {
      await api.respondPermission(id, approved);
    } catch (e) {
      setError(String(e));
    }
  }

  return {
    permissionMode,
    setPermissionMode: (mode: PermissionMode) =>
      sessionId
        ? setPermissionMode(sessionId, mode)
        : setDraftPermissionMode(mode),
    pendingPermission,
    respondPermission,
  };
}
