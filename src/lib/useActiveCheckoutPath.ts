import { useAppStore } from "../store";
import { conversationCheckoutPath } from "../store/conversationSlice";

// The checkout path (worktree or primary root) the currently focused
// conversation is pinned to, or null before any conversation is known.
export function useActiveCheckoutPath(): string | null {
  return useAppStore((s) => {
    const conversation = s.conversations.find(
      (c) => c.id === s.activeSessionId,
    );
    return conversation ? conversationCheckoutPath(conversation) : null;
  });
}
