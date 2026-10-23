import { Undo2 } from "lucide-react";
import { AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import { useBoard } from "../../../../data/board";
import { useConversation } from "../../../../data/conversations";
import { api } from "../../../../lib/tauriApi";
import DockedBanner from "./DockedBanner";

// In a board task's chat while the project chat isn't following it (the
// user wrote here, or it was started by hand): its updates reach the
// project chat only as notes. "Hand back" has the project chat woken by
// them again — see `board::messaging`.
export default function TaskLinkBanner({
  sessionId,
}: {
  sessionId: string | null;
}) {
  const conversation = useConversation(sessionId);
  const board = useBoard(
    conversation?.projectRoot ?? "",
    false,
    !!conversation?.taskId,
  );
  const task = conversation?.taskId
    ? board?.tasks.find((t) => t.id === conversation.taskId)
    : undefined;
  if (!task || task.engagedWithProject || task.status === "done") return null;
  return (
    <DockedBanner variant="info">
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>
          The project chat isn't following #{task.number}: it only gets notes of
          what happens here.
        </span>
        <Button
          variant="chip-primary"
          size="sm"
          className="shrink-0"
          onClick={() => void api.setTaskEngaged(task.id, true)}
        >
          <Undo2 size={13} />
          Hand back to project chat
        </Button>
      </AlertDescription>
    </DockedBanner>
  );
}
