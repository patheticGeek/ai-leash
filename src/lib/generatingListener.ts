import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAppStore } from "../store";

// A brand-new conversation's first turn starts emitting
// `chat://{sessionId}/generating` the instant the backend command is
// invoked — before React has even rendered the store update that adds the
// conversation to `conversations`, let alone run the effect that calls
// `listen()` for it (itself an async IPC round trip). Registering too late
// drops the leading `active: true` for good, leaving `generatingSessions`
// permanently out of sync until the next turn. Keying the pending/attached
// listener promises here (module-level, not component state) lets
// `ChatPanel.submitPrompt` await registration before it ever invokes the
// backend, while `LeftBar` still drives registration for every other,
// already-known conversation the same way it always has.
const listeners = new Map<string, Promise<UnlistenFn>>();

export function ensureGeneratingListener(
  sessionId: string,
): Promise<UnlistenFn> {
  const existing = listeners.get(sessionId);
  if (existing) return existing;
  const promise = listen<{ active: boolean; autonomous: boolean }>(
    `chat://${sessionId}/generating`,
    (e) => {
      const { setSessionGenerating, touchConversationActivity } =
        useAppStore.getState();
      setSessionGenerating(sessionId, e.payload.active, e.payload.autonomous);
      if (e.payload.active) touchConversationActivity(sessionId);
    },
  );
  listeners.set(sessionId, promise);
  return promise;
}

export function forgetGeneratingListener(sessionId: string): void {
  const existing = listeners.get(sessionId);
  if (!existing) return;
  listeners.delete(sessionId);
  existing.then((unlisten) => unlisten());
}
