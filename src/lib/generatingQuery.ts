import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../store";
import { useTauriEvent } from "./useTauriEvent";

export interface GeneratingState {
  active: boolean;
  // The model reacting to a finished background sub-agent on its own,
  // rather than a turn the user is actually waiting on — see
  // `run_with_cancellation`'s doc comment (`chat/agent_loop.rs`).
  autonomous: boolean;
}

const IDLE: GeneratingState = { active: false, autonomous: false };

export function generatingQueryKey(sessionId: string) {
  return ["generating", sessionId] as const;
}

// Per-session turn-in-flight state, driven entirely by the backend's single
// `chat://generating` event (payload carries `sessionId`) rather than any
// frontend action. Defaults to idle for a session with no cache entry yet —
// there's no backend command to fetch a starting value from, so `queryFn`
// only ever supplies that default; real values only ever arrive via
// `useGeneratingListener`'s `setQueryData`.
export function useGenerating(sessionId: string): GeneratingState {
  const query = useQuery({
    queryKey: generatingQueryKey(sessionId),
    queryFn: () => IDLE,
  });
  return query.data ?? IDLE;
}

// One shared `chat://generating` listener for the whole app, mounted once at
// the top level (`App.tsx`) — like `useFsChangeInvalidator`, this replaces
// what used to be a per-session `listen()` call (`generatingListener.ts`,
// now deleted) registered lazily by `LeftBar.tsx` for every known
// conversation, plus a matching one `ChatPanel.submitPrompt` had to `await`
// before invoking the backend so a brand-new conversation's first turn
// couldn't start emitting before its listener existed. A single always-on
// listener sidesteps that race entirely: it's alive before any prompt can
// ever be sent, for every session, known or brand new, with no registration
// step to race against.
export function useGeneratingListener() {
  const queryClient = useQueryClient();

  useTauriEvent<{ sessionId: string; active: boolean; autonomous: boolean }>(
    "chat://generating",
    (payload) => {
      queryClient.setQueryData(generatingQueryKey(payload.sessionId), {
        active: payload.active,
        autonomous: payload.autonomous,
      } satisfies GeneratingState);
      // A turn starting is also what bumps the conversation's sort order —
      // not merely opening/switching to it, or clicking around the sidebar
      // to look at things would keep reshuffling it.
      if (payload.active) {
        useAppStore.getState().touchConversationActivity(payload.sessionId);
      }
    },
  );
}
