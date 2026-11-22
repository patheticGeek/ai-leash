import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { useEffect, useState } from "react";
import { formatClockTime } from "@/lib/format";
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
    <DockedBanner
      status="warning"
      title="Claude session limit"
      description={
        autoResumeArmed
          ? alreadyReset
            ? `Claude's session limit reset at ${formatClockTime(rateLimit.resetAt)}. Resuming now.`
            : `Claude hit its session limit. Will auto-resume at ${formatClockTime(rateLimit.resetAt)}.`
          : alreadyReset
            ? `Claude's session limit has reset (${formatClockTime(rateLimit.resetAt)}). Continue now?`
            : `Claude hit its session limit (resets ${formatClockTime(rateLimit.resetAt)}). Auto-resume then?`
      }
      endContent={
        autoResumeArmed ? (
          <Button
            variant="chip-warning"
            size="sm"
            label="Cancel"
            onClick={onDismiss}
          />
        ) : (
          <HStack gap={2}>
            <Button
              variant="chip-danger"
              size="sm"
              label="No"
              onClick={onDismiss}
            />
            <Button
              variant="chip-success"
              size="sm"
              label={
                alreadyReset ? "Yes, continue" : "Yes, resume automatically"
              }
              onClick={onArmAutoResume}
            />
          </HStack>
        )
      }
    />
  );
}
