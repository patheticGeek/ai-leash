import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { ArrowUpRight } from "lucide-react";
import { useConversation } from "../../../../data/conversations";
import { useAppStore } from "../../../../store";

// How a message from another conversation names its sender: the project
// chat, a task by number, or a chat by title.
export function useChatLabel(id: string | null | undefined): string {
  const conversation = useConversation(id);
  if (!conversation) return "another chat";
  if (conversation.role === "project") return "Project chat";
  if (conversation.taskNumber != null) {
    return `#${conversation.taskNumber} ${conversation.title ?? ""}`.trim();
  }
  return conversation.title ?? "Untitled chat";
}

// "From <sender>" in a user bubble's name slot, linking to that
// conversation.
export default function FromChat({ id }: { id: string }) {
  const label = useChatLabel(id);
  const openConversation = useAppStore((s) => s.openConversation);
  return (
    <Button
      variant="ghost"
      size="sm"
      label={`From ${label}`}
      tooltip={`Open ${label}`}
      endContent={<Icon icon={ArrowUpRight} size="sm" />}
      onClick={() => void openConversation(id)}
    />
  );
}
