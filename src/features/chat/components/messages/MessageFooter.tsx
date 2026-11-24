import { ChatMessageMetadata } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Check, Copy, RotateCcw } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { turnInset } from "./turnInset";

interface MessageFooterProps {
  time: number;
  copied: boolean;
  onCopy: () => void;
  showRetry: boolean;
  onRetry: () => void;
  /** "Worked for <time>" — assistant replies only. */
  turnDuration: number | undefined;
  /**
   * Under a ghost (assistant) bubble: start at its text, not its edge (see
   * `turnInset`). Not the bubble's own `metadata` slot: that pulls the row
   * up by --spacing-1-5 to sit snug under a filled bubble, which crowds a
   * ghost one's last line.
   */
  isInset?: boolean;
}

// The metadata line under a text message (Astryx `ChatMessageMetadata`):
// its time and, for a finished assistant reply whose turn isn't folded into
// a `WorkSummary`, how long the turn took; then copy and optional retry.
export default function MessageFooter({
  time,
  copied,
  onCopy,
  showRetry,
  onRetry,
  turnDuration,
  isInset = false,
}: MessageFooterProps) {
  return (
    <ChatMessageMetadata
      xstyle={isInset ? turnInset.inset : undefined}
      timestamp={<Timestamp value={time} format="time" />}
      footer={
        <HStack gap={0.5} vAlign="center">
          {turnDuration !== undefined && (
            <Text type="supporting" color="secondary" hasTabularNumbers>
              Worked for {formatDuration(turnDuration)}
            </Text>
          )}
          <IconButton
            variant="ghost"
            size="sm"
            label={copied ? "Copied" : "Copy"}
            tooltip="Copy"
            icon={<Icon icon={copied ? Check : Copy} size="sm" />}
            onClick={onCopy}
          />
          {showRetry && (
            <IconButton
              variant="ghost"
              size="sm"
              label="Retry"
              tooltip="Retry"
              icon={<Icon icon={RotateCcw} size="sm" />}
              onClick={onRetry}
            />
          )}
        </HStack>
      }
    />
  );
}
