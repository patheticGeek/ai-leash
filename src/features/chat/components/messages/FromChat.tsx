import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { ArrowUpRight, Inbox } from "lucide-react";
import { useConversation } from "../../../../data/conversations";
import { useAppStore } from "../../../../store";
import Markdown from "../../../../ui/Markdown";
import SystemNotice from "./SystemNotice";

// How a message from another conversation names its sender: the project
// chat, a task by number and title ("#42 · Fix login"), or a chat by title.
export function useChatLabel(id: string | null | undefined): string {
  const conversation = useConversation(id);
  if (!conversation) return "another chat";
  if (conversation.role === "project") return "Project chat";
  if (conversation.taskNumber != null) {
    return [`#${conversation.taskNumber}`, conversation.title]
      .filter(Boolean)
      .join(" · ");
  }
  return conversation.title ?? "Untitled chat";
}

// The sender of an inter-chat message, as a link to that conversation.
export default function FromChat({ id }: { id: string }) {
  const label = useChatLabel(id);
  const openConversation = useAppStore((s) => s.openConversation);
  return (
    <Button
      variant="ghost"
      size="sm"
      label={label}
      tooltip={`Open ${label}`}
      endContent={<Icon icon={ArrowUpRight} size="sm" />}
      onClick={() => void openConversation(id)}
    />
  );
}

// A message another chat sent (task chat ↔ project chat: a user-role
// message with `from`, or a `board::messaging` note): one collapsed line,
// "Message from <sender>" with the sender linking to its chat, and Show for
// the whole body. The open state is remembered for the session.
export function InterChatMessage({
  kind,
  from,
  content,
  time,
}: {
  kind: "message" | "note";
  from: string | null;
  content: string;
  time: number;
}) {
  const label = useChatLabel(from);
  const prefix = kind === "note" ? "Note from" : "Message from";
  return (
    <SystemNotice
      icon={<Icon icon={Inbox} size="sm" />}
      label={from ? prefix : `${prefix} ${label}`}
      actions={from ? <FromChat id={from} /> : undefined}
      persistKey={`${kind}:${from}:${time}`}
    >
      <Markdown content={content} />
    </SystemNotice>
  );
}
