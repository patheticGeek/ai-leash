import { ChatMessageMetadata } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";

interface WorkingForIndicatorProps {
  // Whether the turn has produced anything visible yet (from `entries`) —
  // before that there's nothing to measure the *progress* of, just the wait
  // for the model to respond at all, so this shows "Waiting" instead of a
  // running clock.
  hasActivity: boolean;
  // Durable, cross-remount turn-start time — see `useGenerating`'s
  // `startedAtMs` (`generatingQuery.ts`).
  replyStartedAt: number | null;
}

// The running turn's metadata line: a spinner and "Working for <time>" /
// "Waiting", ticking its own clock once a second internally rather than the
// parent re-rendering on an interval — so the whole transcript doesn't
// re-render every second while a turn is in flight just to update this one
// line. Only mounted while `sending` (see call site), so the interval
// starts/stops with it for free.
export default function WorkingForIndicator({
  hasActivity,
  replyStartedAt,
}: WorkingForIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const label =
    hasActivity && replyStartedAt
      ? `Working for ${formatDuration(Math.max(0, Math.round((now - replyStartedAt) / 1000)))}`
      : "Waiting";
  return (
    <ChatMessageMetadata
      footer={
        <HStack gap={2} vAlign="center">
          <Spinner size="sm" aria-label="Working" />
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {label}
          </Text>
        </HStack>
      }
    />
  );
}
