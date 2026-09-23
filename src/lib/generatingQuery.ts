import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../data/keys";
import { useAppStore } from "../store";
import { api } from "./tauriApi";
import { useTauriEvent } from "./useTauriEvent";

export interface GeneratingState {
  active: boolean;
  // The model reacting to a finished background sub-agent on its own,
  // rather than a turn the user is actually waiting on — see
  // `run_with_cancellation`'s doc comment (`chat/agent_loop.rs`).
  autonomous: boolean;
  // When the currently-active turn actually started (frontend `Date.now()`
  // at the moment `useGeneratingListener` saw `active: true`), or `null`
  // while idle. Lets `ChatPanel.tsx`'s "Working for <time>" clock anchor to
  // a value that survives that component remounting (switching away from
  // and back to a conversation via `App.tsx`'s `key={activeSessionId}`)
  // instead of resetting every time — this cache entry lives outside any
  // component's lifecycle.
  startedAtMs: number | null;
}

const IDLE: GeneratingState = {
  active: false,
  autonomous: false,
  startedAtMs: null,
};

// Per-session turn-in-flight state, driven entirely by the backend's single
// `chat://generating` event (payload carries `sessionId`) rather than any
// frontend action. Defaults to idle for a session with no cache entry yet —
// there's no backend command to fetch a starting value from, so `queryFn`
// only ever supplies that default; real values only ever arrive via
// `useGeneratingListener`'s `setQueryData`.
//
// `staleTime`/`gcTime: Infinity` are load-bearing, not a perf tweak: this
// query's truth comes *only* from that pushed event, so TanStack Query's
// default "refetch on mount if stale" behavior is actively wrong here — for
// any turn running longer than the global default `staleTime` (30s, see
// `queryClient.ts`, routine for tool-heavy ACP turns), remounting a
// `useGenerating` observer (e.g. `ChatPanel` remounting when you switch back
// to a conversation) would otherwise re-run `queryFn`, which always returns
// `IDLE`, silently stomping the correct `{active: true}` back to `false`
// even though the backend never said the turn ended.
export function useGenerating(sessionId: string): GeneratingState {
  const query = useQuery({
    queryKey: qk.generating(sessionId),
    queryFn: () => IDLE,
    staleTime: Infinity,
    gcTime: Infinity,
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
      const key = qk.generating(payload.sessionId);
      if (!payload.active) {
        // Persisting the turn's duration here, in this single always-mounted
        // listener, rather than from `ChatPanel.tsx`, means it happens
        // whether or not that conversation is the one currently open —
        // otherwise a turn that finishes while you're looking at a
        // different conversation never gets a `duration_seconds` recorded
        // at all (see `db::set_message_duration`, conversation-scoped so no
        // message id is needed here).
        const previous = queryClient.getQueryData<GeneratingState>(key);
        if (previous?.startedAtMs != null) {
          const seconds = Math.max(
            0,
            Math.round((Date.now() - previous.startedAtMs) / 1000),
          );
          api.setMessageDuration(payload.sessionId, seconds).catch(() => {});
        }
      }
      queryClient.setQueryData(key, {
        active: payload.active,
        autonomous: payload.autonomous,
        startedAtMs: payload.active ? Date.now() : null,
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
