import { ChatMessageBubble, ChatToolCalls } from "@astryxdesign/core/Chat";
import { Icon } from "@astryxdesign/core/Icon";
import { Inbox, Info } from "lucide-react";
import Markdown from "../../../../ui/Markdown";
import type { PanelEntry } from "../../hooks/useChatStream";
import FromChat, { useChatLabel } from "./FromChat";
import MessageFooter from "./MessageFooter";
import SystemNotice from "./SystemNotice";
import { toolCallFor } from "./toolCalls";

export interface ChatEntryRendererProps {
  entry: PanelEntry;
  /** Its index in `entries` (a stable key for its tool-call row). */
  index: number;
  isLast: boolean;
  sending: boolean;
  copied: boolean;
  onCopy: () => void;
  onRetry: () => void;
  turnDuration: number | undefined;
  showFooter: boolean;
  // Whether the last reply's footer may show a Retry button at all — false
  // when the backend can't re-run a turn (`caps.retry`, e.g. an ACP agent)
  // or the transcript has no "send this again" of its own (e.g.
  // `SubAgentChatTab.tsx`), where the button would be a dead control.
  allowRetry: boolean;
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}

// A note another chat left (`board::messaging`): its sender and first line,
// with Show for the whole note.
function NoteRow({ from, content }: { from: string | null; content: string }) {
  const label = useChatLabel(from);
  return (
    <SystemNotice
      icon={<Icon icon={Inbox} size="sm" />}
      label={`Note from ${label}`}
      summary={firstLine(content)}
    >
      <Markdown content={content} />
    </SystemNotice>
  );
}

// A local notice ("Conversation compacted: …"): its first line, with Show
// for the rest when there is more.
function InfoRow({ content }: { content: string }) {
  const [head, ...rest] = content.trim().split("\n");
  const body = rest.join("\n").trim();
  return (
    <SystemNotice icon={<Icon icon={Info} size="sm" />} label={head ?? ""}>
      {body ? <Markdown content={body} /> : undefined}
    </SystemNotice>
  );
}

// Renders one transcript entry as its Astryx chat part — the counterpart to
// `ChatEntryList.tsx`, which groups entries (`entryGrouping.ts`) and wraps
// them in `ChatMessage`s. A user message is a filled bubble (with "From …"
// in its name slot when another chat sent it); an assistant reply is a
// full-width ghost bubble; notes and local notices are `SystemNotice`s; a
// lone thinking/tool entry is a one-row `ChatToolCalls` (runs of them go
// through `ActivityGroup`). Also reused as-is by `SubAgentChatTab.tsx` (via
// `ChatEntryList`) with `allowRetry` off.
export default function ChatEntryRenderer({
  entry,
  index,
  isLast,
  sending,
  copied,
  onCopy,
  onRetry,
  turnDuration,
  showFooter,
  allowRetry,
}: ChatEntryRendererProps) {
  if (entry.kind === "info") return <InfoRow content={entry.content} />;

  if (entry.kind === "note") {
    return <NoteRow from={entry.from} content={entry.content} />;
  }

  if (entry.kind === "text") {
    const isUser = entry.role === "user";
    const footer = showFooter ? (
      <MessageFooter
        time={entry.time}
        copied={copied}
        onCopy={onCopy}
        showRetry={!isUser && !sending && isLast && allowRetry}
        onRetry={onRetry}
        turnDuration={isUser ? undefined : turnDuration}
      />
    ) : undefined;
    if (isUser) {
      return (
        <ChatMessageBubble
          name={entry.from ? <FromChat id={entry.from} /> : undefined}
          metadata={footer}
        >
          <Markdown content={entry.content} />
        </ChatMessageBubble>
      );
    }
    return (
      <>
        <ChatMessageBubble variant="ghost" width="100%">
          <Markdown content={entry.content} />
        </ChatMessageBubble>
        {footer}
      </>
    );
  }

  const call = toolCallFor(entry, index, isLast);
  return call ? <ChatToolCalls calls={[call]} /> : null;
}
