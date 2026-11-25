import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Undo2 } from "lucide-react";
import { api } from "../../../../lib/tauriApi";
import { useConversationTask } from "../../hooks/useConversationTask";

// In a board task's chat while the project chat isn't following it (the
// user took it over, or it was started by hand): none of its replies are
// forwarded to the project chat, though the two can still message each
// other. "Hand back" has the project chat follow it again — see
// `board::messaging`. An info `Banner`: state you can change.
export default function TaskLinkBanner({
  sessionId,
}: {
  sessionId: string | null;
}) {
  const task = useConversationTask(sessionId);
  if (!task || task.engagedWithProject || task.status === "done") return null;
  return (
    <Banner
      status="info"
      elevation="low"
      collapsible={false}
      title={`You've taken over #${task.number}`}
      description="Its replies aren't forwarded to the project chat. You can still message each other; hand it back to have the project chat follow it again."
      endContent={
        <Button
          variant="primary"
          size="sm"
          label="Hand back to project chat"
          icon={<Undo2 size={14} />}
          onClick={() => void api.setTaskEngaged(task.id, true)}
        />
      }
    />
  );
}
