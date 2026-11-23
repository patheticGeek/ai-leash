import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { useEffect, useState } from "react";
import { formatClockTime } from "@/lib/format";

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

// "1:42:07" / "4:05" until `ms` runs out.
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Claude's session limit, a warning `Banner` in the composer's stack (it
// needs a decision). Once auto-resume is armed it counts down to the reset,
// ticking every second; before that it only re-renders when the reset
// time passes.
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
    if (autoResumeArmed) {
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(delay, 2 ** 31 - 1),
    );
    return () => clearTimeout(timer);
  }, [rateLimit.resetAt, autoResumeArmed]);
  const alreadyReset = rateLimit.resetAt <= now;
  const resetsAt = formatClockTime(rateLimit.resetAt);

  if (autoResumeArmed) {
    return (
      <Banner
        status="warning"
        elevation="low"
        collapsible={false}
        title={
          alreadyReset
            ? "Claude session limit reset · resuming now"
            : `Claude session limit reached · resuming in ${formatCountdown(rateLimit.resetAt - now)}`
        }
        description={
          alreadyReset
            ? `It reset at ${resetsAt}.`
            : `Resets at ${resetsAt}. This turn picks up automatically then.`
        }
        endContent={
          <Button
            variant="ghost"
            size="sm"
            label="Don't resume"
            onClick={onDismiss}
          />
        }
      />
    );
  }
  return (
    <Banner
      status="warning"
      elevation="low"
      collapsible={false}
      title={
        alreadyReset
          ? "Claude session limit has reset"
          : "Claude session limit reached"
      }
      description={
        alreadyReset
          ? `It reset at ${resetsAt}. Continue this turn now?`
          : `Resets at ${resetsAt}. Resume this turn automatically then?`
      }
      endContent={
        <HStack gap={1}>
          <Button variant="ghost" size="sm" label="No" onClick={onDismiss} />
          <Button
            variant="primary"
            size="sm"
            label={alreadyReset ? "Yes, continue" : "Yes, resume automatically"}
            onClick={onArmAutoResume}
          />
        </HStack>
      }
    />
  );
}
