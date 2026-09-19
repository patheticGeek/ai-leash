import { formatClockTime } from "@/lib/format";
import { Button } from "@/ui/button";

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
  return (
    <div className="z-10 mx-7 -mb-4 flex items-center justify-between gap-3 rounded-t-md bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
      <span>
        {autoResumeArmed
          ? `Claude hit its session limit. Will auto-resume at ${formatClockTime(rateLimit.resetAt)}.`
          : `Claude hit its session limit (resets ${formatClockTime(rateLimit.resetAt)}). Auto-resume then?`}
      </span>
      <div className="flex shrink-0 gap-2">
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
              Yes, resume automatically
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
