import { useBoard } from "../../../data/board";
import { useConversation } from "../../../data/conversations";

// The board task `sessionId` is the chat of, if it's one — what the
// takeover dialog and `TaskLinkBanner` read `engagedWithProject` from.
export function useConversationTask(sessionId: string | null) {
  const conversation = useConversation(sessionId);
  const board = useBoard(
    conversation?.projectRoot ?? "",
    false,
    !!conversation?.taskId,
  );
  return conversation?.taskId
    ? board?.tasks.find((t) => t.id === conversation.taskId)
    : undefined;
}
