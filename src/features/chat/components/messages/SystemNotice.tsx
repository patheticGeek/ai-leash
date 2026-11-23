import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ChatSystemMessage } from "@astryxdesign/core/Chat";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { type ReactNode, useState } from "react";

interface SystemNoticeProps {
  icon: ReactNode;
  label: string;
  /** One-line preview shown after the label while closed. */
  summary?: string;
  /** What Show reveals under the line; omit for a plain notice. */
  children?: ReactNode;
}

// A non-sender line in the transcript (the system prompt, a note another
// chat left, a local notice like "Conversation compacted") as an Astryx
// `ChatSystemMessage` with an icon. With `children` it gets a Show / Hide
// button that opens the detail in a muted card under it — rendered only
// while open, so a long note or prompt isn't in the DOM until asked for.
export default function SystemNotice({
  icon,
  label,
  summary,
  children,
}: SystemNoticeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasDetail = children != null;
  return (
    <VStack gap={2} width="100%">
      <ChatSystemMessage icon={icon}>
        <Text type="supporting" color="secondary">
          {summary && !isOpen ? `${label} · ${summary}` : label}
        </Text>
        {hasDetail && (
          <Button
            variant="ghost"
            size="sm"
            label={isOpen ? "Hide" : "Show"}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((v) => !v)}
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
