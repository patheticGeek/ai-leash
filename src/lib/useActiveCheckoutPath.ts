import { useConversation } from "../data/conversations";
import { useAppStore } from "../store";
import { conversationCheckoutPath } from "../store/conversationSlice";

// The checkout path (worktree or primary root) the currently focused
// conversation is pinned to — or a new thread has picked — or null before
// any conversation is known.
export function useActiveCheckoutPath(): string | null {
  const sessionId = useAppStore((s) => s.activeSessionId);
  const draft = useAppStore((s) => s.draft);
  const remembered = useAppStore((s) =>
    sessionId ? s.checkoutPathBySession[sessionId] : undefined,
  );
  const projectRoot = useAppStore((s) => s.projectRoot);
  const conversation = useConversation(sessionId);
  if (!sessionId) {
    return draft ? (draft.worktreePath ?? draft.projectRoot) : null;
  }
  if (remembered) return remembered;
  return conversation ? conversationCheckoutPath(conversation) : projectRoot;
}
