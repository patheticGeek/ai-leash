import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ChatSystemMessage } from "@astryxdesign/core/Chat";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { type ReactNode, useState } from "react";

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
      <ChatSystemMessage icon={icon}>
        <Text type="supporting" color="secondary">
          {summary && !isOpen ? `${label} · ${summary}` : label}
        </Text>
        {actions}
        {hasDetail && (
          <Button
            variant="ghost"
            size="sm"
            label={isOpen ? "Hide" : "Show"}
            aria-expanded={isOpen}
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
