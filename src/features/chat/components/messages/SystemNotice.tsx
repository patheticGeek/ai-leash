import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ChatSystemMessage } from "@astryxdesign/core/Chat";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { type ReactNode, useState } from "react";

// The container a one-line notice's row is, for `@container system-notice`
// queries in what it holds (FromChat drops a task's title when narrow).
// Written out again in `FromChat.tsx`'s `NARROW` query; keep them in step.
const SYSTEM_NOTICE_CONTAINER = "system-notice";

const styles = stylex.create({
  // A one-line notice: `ChatSystemMessage` is a centring flex row whose
  // content box would otherwise refuse to shrink below its min-content (so
  // the label wrapped word by word). A single `minmax(0, max-content)`
  // track still centres it and sizes it to its content, but lets it shrink
  // to the row's width so its parts truncate instead.
  oneLineRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, max-content)",
    containerType: "inline-size",
    containerName: SYSTEM_NOTICE_CONTAINER,
  },
  // Fixed parts of the line: never wrap, never squeezed.
  fixed: { flexShrink: 0 },
});

// Which notices (by `persistKey`) the user opened or closed, for the rest of
// the session, so one stays as left when the transcript remounts (switching
// chats, reopening a tab).
const remembered = new Map<string, boolean>();

interface SystemNoticeProps {
  icon: ReactNode;
  label: string;
  /** One-line preview shown after the label while closed. */
  summary?: string;
  /** Controls after the label, before Show/Hide (a sender link, Open). */
  actions?: ReactNode;
  /** Whether the detail starts open. Defaults to closed. */
  isDefaultOpen?: boolean;
  /** Keeps the line on one line: the label never wraps or shrinks, and
   *  `actions` take the space left (truncating themselves). */
  isOneLine?: boolean;
  /** Remembers the open state under this key for the session. */
  persistKey?: string;
  /** What Show reveals under the line; omit for a plain notice. */
  children?: ReactNode;
}

// A non-sender line in the transcript (the system prompt, a message or note
// from another chat, a sub-agent's result, a local notice like "Conversation
// compacted") as an Astryx `ChatSystemMessage` with an icon. With `children`
// it gets a Show / Hide button that opens the detail in a muted card under
// it — rendered only while open, so a long note or prompt isn't in the DOM
// until asked for.
export default function SystemNotice({
  icon,
  label,
  summary,
  actions,
  isDefaultOpen = false,
  isOneLine = false,
  persistKey,
  children,
}: SystemNoticeProps) {
  const [isOpen, setIsOpen] = useState(
    () =>
      (persistKey !== undefined ? remembered.get(persistKey) : undefined) ??
      isDefaultOpen,
  );
  const toggle = () => {
    const next = !isOpen;
    if (persistKey) remembered.set(persistKey, next);
    setIsOpen(next);
  };
  const hasDetail = children != null;
  return (
    <VStack gap={2} width="100%">
      <ChatSystemMessage
        icon={icon}
        xstyle={isOneLine ? styles.oneLineRow : undefined}
      >
        <Text
          type="supporting"
          color="secondary"
          textWrap={isOneLine ? "nowrap" : undefined}
          xstyle={isOneLine ? styles.fixed : undefined}
        >
          {summary && !isOpen ? `${label} · ${summary}` : label}
        </Text>
        {actions}
        {hasDetail && (
          <Button
            variant="ghost"
            size="sm"
            label={isOpen ? "Hide" : "Show"}
            aria-expanded={isOpen}
            xstyle={styles.fixed}
            onClick={toggle}
          />
        )}
      </ChatSystemMessage>
      {hasDetail && isOpen && (
        <Card variant="muted" padding={3}>
          {children}
        </Card>
      )}
    </VStack>
  );
}
