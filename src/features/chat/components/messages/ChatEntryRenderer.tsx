import { ChatMessageBubble, ChatToolCalls } from "@astryxdesign/core/Chat";
import { Icon } from "@astryxdesign/core/Icon";
import { Info } from "lucide-react";
import { memo } from "react";
import Markdown from "../../../../ui/Markdown";
import { isSubAgentResult } from "../../entryGrouping";
import type { PanelEntry } from "../../hooks/useChatStream";
import { InterChatMessage } from "./FromChat";
import MentionChips from "./MentionChips";
import MessageFooter from "./MessageFooter";
import SubAgentResult from "./SubAgentResult";
import SystemNotice from "./SystemNotice";
import { toolCallFor } from "./toolCalls";
import { turnInset } from "./turnInset";

export interface ChatEntryRendererProps {
  entry: PanelEntry;
  /** Its index in `entries` (a stable key for its tool-call row). */
  index: number;
  isLast: boolean;
  sending: boolean;
  copied: boolean;
  // Shared by every row (it gets the row's own text and index), so it can
  // stay one stable function and a row only re-renders when it changes.
  onCopy: (text: string, index: number) => void;
  onRetry: () => void;
  turnDuration: number | undefined;
  showFooter: boolean;
  // Whether the last reply's footer may show a Retry button at all — false
  // when the backend can't re-run a turn (`caps.retry`, e.g. an ACP agent)
  // or the transcript has no "send this again" of its own (e.g.
  // `SubAgentChatTab.tsx`), where the button would be a dead control.
  allowRetry: boolean;
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
// them in `ChatMessage`s. A user message is a filled bubble; one another
// chat sent, and a note, is a collapsed `InterChatMessage` line; an
// assistant reply is a full-width ghost bubble; local notices and sub-agent
// results (`SubAgentResult`) are `SystemNotice`s; a
// lone thinking/tool entry is a one-row `ChatToolCalls` (runs of them go
// through `ActivityGroup`). Also reused as-is by `SubAgentChatTab.tsx` (via
// `ChatEntryList`) with `allowRetry` off. `memo`'d: while a reply streams
// only the entry it grows gets a new object (`chatEntries.ts`), so every
// other row skips the re-render, given the stable props `ChatEntryList`
// passes.
function ChatEntryRenderer({
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
    return (
      <InterChatMessage
        kind="note"
        from={entry.from}
        content={entry.content}
        time={entry.time}
      />
    );
  }

  if (entry.kind === "text" && entry.role === "user" && entry.from) {
    return (
      <InterChatMessage
        kind="message"
        from={entry.from}
        content={entry.content}
        time={entry.time}
      />
    );
  }

  if (entry.kind === "text") {
    const isUser = entry.role === "user";
    const footer = showFooter ? (
      <MessageFooter
        time={entry.time}
        copied={copied}
        onCopy={() => onCopy(entry.content, index)}
        showRetry={!isUser && !sending && isLast && allowRetry}
        onRetry={onRetry}
        turnDuration={isUser ? undefined : turnDuration}
        isInset={!isUser}
      />
    ) : undefined;
    if (isUser) {
      return (
        <ChatMessageBubble metadata={footer}>
          <Markdown content={entry.content} />
          {entry.mentions && entry.mentions.length > 0 && (
            <MentionChips paths={entry.mentions} />
          )}
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

  if (isSubAgentResult(entry) && entry.kind === "tool") {
    return <SubAgentResult entry={entry} />;
  }

  const call = toolCallFor(entry, index, isLast);
  return call ? (
    <ChatToolCalls calls={[call]} xstyle={turnInset.inset} />
  ) : null;
}

export default memo(ChatEntryRenderer);
