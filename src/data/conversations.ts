import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import { api, type ConversationSummary } from "../lib/tauriApi";
import { useTauriEvent } from "../lib/useTauriEvent";
import { qk } from "./keys";

export type { ConversationSummary };

// Every top-level conversation across every known project — the sidebar's
// own scope. Kept live by `useConversationsListener` (mounted once in
// `App.tsx`, like `useGeneratingListener`/`useFsChangeInvalidator`) reacting
// to the backend's `conversation://changed` event; nothing else invalidates
// or refetches this query. Inherits the global 30s `staleTime`
// (`queryClient.ts`) rather than `Infinity` — not every write path has a
// live signal yet (a turn's own `save_message` upsert rides `chat://
// generating`'s `active: true` as a proxy, not its own event; see
// `PLAN.md`'s cache-lifetime note).
export function useConversations(): ConversationSummary[] {
  const { data } = useQuery({
    queryKey: qk.conversations,
    queryFn: listConversations,
  });
  return data ?? [];
}

// Selects one conversation out of the same list query — never a second
// fetch (see PLAN.md's Phase 3 note on why there's no separate
// `["conversation", id]` key yet).
export function useConversation(
  id: string | null | undefined,
): ConversationSummary | undefined {
  const conversations = useConversations();
  return id ? conversations.find((c) => c.id === id) : undefined;
}

// For code outside React (`conversationSlice.ts`'s actions are plain
// functions, not hooks) that needs the current list synchronously. Falls
// back to `[]` rather than throwing (unlike `preferences.ts`'s
// `getPreferences`) — this query isn't seeded before first render the way
// preferences are, so reading it early is an expected, harmless case here.
export function getConversations(): ConversationSummary[] {
  return (
    queryClient.getQueryData<ConversationSummary[]>(qk.conversations) ?? []
  );
}

// Non-React equivalent of a mutation's optimistic `setQueryData` —
// `conversationSlice.ts`'s actions call this directly instead of Zustand's
// `set()` for the fields that moved here.
export function setConversations(
  updater: (prev: ConversationSummary[]) => ConversationSummary[],
): void {
  queryClient.setQueryData<ConversationSummary[]>(qk.conversations, (old) =>
    updater(old ?? []),
  );
}

// Awaits a real fetch and returns the resolved list — `conversationSlice.ts`'s
// `loadAllConversations`/`initializeStartupSession` need this synchronously
// (deciding which project to restore, etc.), not just a query subscription.
// Shares the in-flight request with anything else already fetching this key.
export function fetchConversations(): Promise<ConversationSummary[]> {
  return queryClient.fetchQuery({
    queryKey: qk.conversations,
    queryFn: listConversations,
  });
}

// Rows inserted client-side ahead of the backend having them
// (`insertConversation`, for a thread's first send). A refetch — any
// `conversation://changed` invalidation — can land between that insert and
// the first `save_message` creating the real row; without this the new
// thread would drop out of the sidebar until the next refetch. Each entry is
// dropped as soon as a fetch returns its id (or it's deleted). Merging here
// rather than `cancelQueries` before the insert: a cancelled fetch reverts
// the cache asynchronously, which would wipe the insert anyway.
const pendingInserts = new Map<string, ConversationSummary>();

async function listConversations(): Promise<ConversationSummary[]> {
  const rows = await api.listConversations();
  for (const row of rows) pendingInserts.delete(row.id);
  return pendingInserts.size ? [...pendingInserts.values(), ...rows] : rows;
}

// Adds a conversation the backend doesn't have yet — see `pendingInserts`.
export function insertConversation(row: ConversationSummary): void {
  pendingInserts.set(row.id, row);
  setConversations((prev) =>
    prev.some((c) => c.id === row.id) ? prev : [row, ...prev],
  );
}

export function removeConversation(id: string): void {
  pendingInserts.delete(id);
  setConversations((prev) => prev.filter((c) => c.id !== id));
}

// The one way to change a single listed conversation in place.
export function patchConversation(
  id: string,
  patch: (c: ConversationSummary) => ConversationSummary,
): void {
  setConversations((prev) =>
    prev.some((c) => c.id === id)
      ? prev.map((c) => (c.id === id ? patch(c) : c))
      : prev,
  );
}

// One shared `conversation://changed` listener for the whole app — see
// `useGeneratingListener`'s doc comment (`generatingQuery.ts`) for why one
// always-mounted listener beats a per-conversation one (the exact bug class
// `useChatStream.ts`'s two recent sub-agent fixes were about). `reason` isn't
// consulted yet: every reason invalidates the whole list, since the payload
// carries no new value to `setQueryData` with — Phase 3b starts patching
// specific fields once mutations go through one shared helper.
export function useConversationsListener() {
  useTauriEvent<{ conversationId: string; reason: string }>(
    "conversation://changed",
    () => {
      void queryClient.invalidateQueries({ queryKey: qk.conversations });
    },
  );
}
