import { Button } from "@astryxdesign/core/Button";
import { Undo2 } from "lucide-react";
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
    <DockedBanner
      status="info"
      title={`The project chat isn't following #${task.number}`}
      description="It only gets notes of what happens here."
      endContent={
        <Button
          variant="chip-primary"
          size="sm"
          label="Hand back to project chat"
          icon={<Undo2 size={13} />}
          className="shrink-0"
          onClick={() => void api.setTaskEngaged(task.id, true)}
        />
      }
    />
  );
}
