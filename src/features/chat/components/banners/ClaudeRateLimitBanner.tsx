import { useEffect, useState } from "react";
import { formatClockTime } from "@/lib/format";
import { AlertAction, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import DockedBanner from "./DockedBanner";

export interface ClaudeRateLimit {
  message: string;
  resetAt: number;
}

interface ClaudeRateLimitBannerProps {
  rateLimit: ClaudeRateLimit;
  autoResumeArmed: boolean;
  onArmAutoResume: () => void;
  onDismiss: () => void;
}

export default function ClaudeRateLimitBanner({
  rateLimit,
  autoResumeArmed,
  onArmAutoResume,
  onDismiss,
}: ClaudeRateLimitBannerProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const delay = rateLimit.resetAt - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(delay, 2 ** 31 - 1),
    );
    return () => clearTimeout(timer);
  }, [rateLimit.resetAt]);
  const alreadyReset = rateLimit.resetAt <= now;
  return (
    <DockedBanner variant="warning">
      <AlertDescription>
        {autoResumeArmed
          ? alreadyReset
            ? `Claude's session limit reset at ${formatClockTime(rateLimit.resetAt)}. Resuming now.`
            : `Claude hit its session limit. Will auto-resume at ${formatClockTime(rateLimit.resetAt)}.`
          : alreadyReset
            ? `Claude's session limit has reset (${formatClockTime(rateLimit.resetAt)}). Continue now?`
            : `Claude hit its session limit (resets ${formatClockTime(rateLimit.resetAt)}). Auto-resume then?`}
      </AlertDescription>
      <AlertAction>
        {autoResumeArmed ? (
          <Button
            size="sm"
            variant="chip-warning"
            bordered={false}
            onClick={onDismiss}
          >
            Cancel
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="chip-danger"
              bordered={false}
              onClick={onDismiss}
            >
              No
            </Button>
            <Button
              size="sm"
              variant="chip-success"
              bordered={false}
              onClick={onArmAutoResume}
            >
              {alreadyReset ? "Yes, continue" : "Yes, resume automatically"}
            </Button>
          </>
        )}
      </AlertAction>
    </DockedBanner>
  );
}
