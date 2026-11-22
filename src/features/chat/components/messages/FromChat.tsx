import { Button } from "@astryxdesign/core/Button";
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

// "From <sender>", linking to that conversation.
export default function FromChat({ id }: { id: string }) {
  const label = useChatLabel(id);
  const openConversation = useAppStore((s) => s.openConversation);
  return (
    <Button
      variant="quiet"
      size="sm"
      label={`From ${label}`}
      tooltip={`Open ${label}`}
      onClick={() => void openConversation(id)}
      className="h-auto gap-0.5 p-0 text-xs"
    >
      From {label}
      <ArrowUpRight size={11} className="inline" />
    </Button>
  );
}
