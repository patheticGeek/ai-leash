import { ArrowUpRight } from "lucide-react";
import { Button } from "@/ui/button";
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
      variant="unstyled"
      size="none"
      onClick={() => void openConversation(id)}
      title={`Open ${label}`}
      className="gap-0.5 text-xs text-zinc-500 hover:text-zinc-300"
    >
      From {label}
      <ArrowUpRight size={11} />
    </Button>
  );
}
