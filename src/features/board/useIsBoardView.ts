import { useConversation } from "../../data/conversations";
import { useAppStore } from "../../store";

// Whether the open conversation is a project's board chat, which shows as
// the board with a slim chat docked beside it — no tab strip, side panel or
// checkout bar. See `ProjectBoardView`.
export function useIsBoardView(): boolean {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  return useConversation(activeSessionId)?.role === "project";
}
