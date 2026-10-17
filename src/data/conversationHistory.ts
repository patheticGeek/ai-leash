import { queryClient } from "../lib/queryClient";
import { api, type PersistedMessage } from "../lib/tauriApi";
import { qk } from "./keys";

// A conversation's saved transcript, fetched by `openConversation` alongside
// its other switch round trips so `ChatPanel` mounts with the transcript
// already in hand instead of flashing an empty one while it loads. Always a
// fresh read (`staleTime: 0`) — the copy only has to survive from the switch
// to the mount that consumes it (`useChatStream`), which then drops it; from
// there on the live `chat://` stream is the source of truth.
export function prefetchConversationHistory(
  sessionId: string,
): Promise<PersistedMessage[]> {
  return queryClient.fetchQuery({
    queryKey: qk.conversationHistory(sessionId),
    queryFn: () => api.loadConversationHistory(sessionId),
    staleTime: 0,
  });
}

export function getPrefetchedConversationHistory(
  sessionId: string,
): PersistedMessage[] | undefined {
  return queryClient.getQueryData<PersistedMessage[]>(
    qk.conversationHistory(sessionId),
  );
}

export function forgetPrefetchedConversationHistory(sessionId: string): void {
  queryClient.removeQueries({
    queryKey: qk.conversationHistory(sessionId),
    exact: true,
  });
}
