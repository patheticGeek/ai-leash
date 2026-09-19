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
  const alreadyReset = rateLimit.resetAt <= Date.now();
  return (
    <DockedBanner variant="warning">
      <AlertDescription>
        {autoResumeArmed
          ? alreadyReset
            ? "Claude's session limit has reset. Resuming now."
            : `Claude hit its session limit. Will auto-resume at ${formatClockTime(rateLimit.resetAt)}.`
          : alreadyReset
            ? `Claude hit its session limit, which reset at ${formatClockTime(rateLimit.resetAt)}. Continue now?`
            : `Claude hit its session limit (resets ${formatClockTime(rateLimit.resetAt)}). Auto-resume then?`}
      </AlertDescription>
      <AlertAction>
        {autoResumeArmed ? (
          <Button size="sm" variant="outline" onClick={onDismiss}>
            Cancel
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={onDismiss}>
              No
            </Button>
            <Button size="sm" onClick={onArmAutoResume}>
              {alreadyReset ? "Yes, continue" : "Yes, resume automatically"}
            </Button>
          </>
        )}
      </AlertAction>
    </DockedBanner>
  );
}
