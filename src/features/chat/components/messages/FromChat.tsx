import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import * as stylex from "@stylexjs/stylex";
import { ArrowUpRight, Inbox } from "lucide-react";
import { useConversation } from "../../../../data/conversations";
import { useAppStore } from "../../../../store";
import Markdown from "../../../../ui/Markdown";
import SystemNotice from "./SystemNotice";

// Below this notice-row width a task's title would have room for only a
// few characters, so the sender shows just its number ("#42").
// StyleX compiles this at build time, so the container name is written out
// here rather than imported from `SystemNotice` (only `.stylex.ts` exports
// may be imported into `stylex.create`); keep the two in step.
const NARROW = "@container system-notice (max-width: 280px)";

const styles = stylex.create({
  number: { flexShrink: 0 },
  title: {
    minWidth: 0,
    flexShrink: 1,
    display: { default: null, [NARROW]: "none" },
  },
});

interface ChatSource {
  /** The whole name: "#42 · Fix login", "Project chat", a chat's title. */
  label: string;
  /** A task chat's number, shown apart so it never truncates. */
  taskNumber?: number;
  /** A task chat's title, if it has one. */
  title?: string;
}

// How a message from another conversation names its sender: the project
// chat, a task by number and title ("#42 · Fix login"), or a chat by title.
function useChatSource(id: string | null | undefined): ChatSource {
  const conversation = useConversation(id);
  if (!conversation) return { label: "another chat" };
  if (conversation.role === "project") return { label: "Project chat" };
  if (conversation.taskNumber != null) {
    const title = conversation.title || undefined;
    const number = `#${conversation.taskNumber}`;
    return {
      label: title ? `${number} · ${title}` : number,
      taskNumber: conversation.taskNumber,
      title,
    };
  }
  return { label: conversation.title ?? "Untitled chat" };
}

// The sender of an inter-chat message, as a link to that conversation. A
// task shows "#42 · title" with the title truncating, and dropped once the
// row is too narrow for any of it (`NARROW`), so the number always shows;
// any other chat is its name, truncating. The tooltip has the full name.
export default function FromChat({ id }: { id: string }) {
  const { label, taskNumber, title } = useChatSource(id);
  const openConversation = useAppStore((s) => s.openConversation);
  return (
    <Button
      variant="ghost"
      size="sm"
      label={label}
      tooltip={`Open ${label}`}
      endContent={<Icon icon={ArrowUpRight} size="sm" />}
      onClick={() => void openConversation(id)}
    >
      {taskNumber != null ? (
        <HStack as="span" gap={1} vAlign="center">
          <Text
            type="inherit"
            color="inherit"
            textWrap="nowrap"
            xstyle={styles.number}
          >
            {`#${taskNumber}`}
          </Text>
          {title && (
            <Text
              type="inherit"
              color="inherit"
              maxLines={1}
              hasTruncateTooltip={false}
              xstyle={styles.title}
            >
              {`· ${title}`}
            </Text>
          )}
        </HStack>
      ) : undefined}
    </Button>
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
  const { label } = useChatSource(from);
  const prefix = kind === "note" ? "Note from" : "Message from";
  return (
    <SystemNotice
      icon={<Icon icon={Inbox} size="sm" />}
      label={from ? prefix : `${prefix} ${label}`}
      actions={from ? <FromChat id={from} /> : undefined}
      isOneLine
      persistKey={`${kind}:${from}:${time}`}
    >
      <Markdown content={content} />
    </SystemNotice>
  );
}
