import { LS_KEYS } from "./localStorageKeys";

// Shared by `useChatInput.ts` (reads/writes the draft as the user types) and
// `conversationSlice.ts`'s `deleteConversation` (removes it once the
// conversation it belongs to is gone for good) — kept in one place so the
// key format can't drift between the two.
export function chatDraftKey(sessionId: string): string {
  return `${LS_KEYS.chatDraftPrefix}${sessionId}`;
}
