import { useEffect, useState } from "react";
import { formatDuration } from "./ChatEntryRenderer";

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

// Renders the "Working for <time>" / "Waiting" footer, ticking its own
// clock once a second internally rather than the parent re-rendering on an
// interval — `ChatEntryList` (and everything above it) used to own that
// tick, meaning the whole transcript re-rendered every second while a turn
// was in flight just to update this one line. Only mounted while `sending`
// (see call site), so the interval starts/stops with it for free.
export default function WorkingForIndicator({
  hasActivity,
  replyStartedAt,
}: WorkingForIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-sm">
      {hasActivity && replyStartedAt ? (
        <span className="shine-text">
          {`Working for ${formatDuration(Math.max(0, Math.round((now - replyStartedAt) / 1000)))}`}
        </span>
      ) : (
        <span className="shine-text">Waiting</span>
      )}
    </div>
  );
}
