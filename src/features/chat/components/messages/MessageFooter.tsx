import { ChatMessageMetadata } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Check, Copy, RotateCcw } from "lucide-react";
import { formatDuration } from "@/lib/format";

const styles = stylex.create({
  // A ghost bubble keeps the filled bubble's inline padding (--spacing-4 at
  // the transcript's balanced and compact densities), so its text starts
  // that far in; the footer below it starts there too. Not the bubble's own
  // `metadata` slot: that pulls the row up by --spacing-1-5 to sit snug
  // under a filled bubble, which crowds a ghost one's last line.
  inset: { paddingInline: spacingVars["--spacing-4"] },
});

interface MessageFooterProps {
  time: number;
  copied: boolean;
  onCopy: () => void;
  showRetry: boolean;
  onRetry: () => void;
  /** "Worked for <time>" — assistant replies only. */
  turnDuration: number | undefined;
  /** Under a ghost (assistant) bubble: start at its text, not its edge. */
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
      xstyle={isInset ? styles.inset : undefined}
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
