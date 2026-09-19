import { useEffect } from "react";
import { api } from "../../../lib/tauriApi";
import { permissionForSession, useAppStore } from "../../../store";
import type { PermissionMode } from "../../../store/permissionSlice";

// This conversation's Ask/Bypass permission mode plus whichever permission
// request (its own or a spawned sub-agent's) is currently waiting on an
// answer.
export function useSessionPermissions(
  sessionId: string,
  setError: (message: string | null) => void,
) {
  // Ask/Bypass permission mode — see `setPermissionMode`'s doc comment in
  // the store. Enforcement is backend-side and in-memory only, so this
  // pushes whatever's already stored down to it once per mount (the panel
  // remounts per conversation — see `App.tsx`'s `key={activeSessionId}`) to
  // restore it after an app restart.
  const permissionMode = useAppStore(
    (s) => s.permissionMode[sessionId] ?? "ask",
  );
  const setPermissionMode = useAppStore((s) => s.setPermissionMode);
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only re-sync (see comment above) — must not re-fire when permissionMode itself changes
  useEffect(() => {
    setPermissionMode(sessionId, permissionMode);
  }, [sessionId]);

  // Resolves to a real request only while this project (or a sub-agent it
  // spawned) has one pending — see `permissionForSession`. Global listeners
  // that populate `pendingPermissions` live in `LeftBar.tsx`, always mounted
  // regardless of which project is currently open, same pattern as
  // `useGeneratingListener`.
  const pendingPermissions = useAppStore((s) => s.pendingPermissions);
  const resolvePendingPermission = useAppStore(
    (s) => s.resolvePendingPermission,
  );
  const pendingPermission = permissionForSession(pendingPermissions, sessionId);

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
      setPermissionMode(sessionId, mode),
    pendingPermission,
    respondPermission,
  };
}
