// Claude Code's ACP wrapper reports a hit session limit as plain error text
// like "You've hit your session limit · resets 11:20pm (Asia/Kolkata)" —
// there's no structured field for it anywhere in the ACP error union, so
// this is the only way to tell it apart from any other agent error. The
// parenthesized zone name is ignored: the printed clock time is assumed to
// already be this machine's local time (both run on the same box), so no
// timezone-aware date math is needed to turn it into a wall-clock instant.
const SESSION_LIMIT_RE = /session limit/i;
const RESET_TIME_RE = /resets?\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*([ap]m)/i;

// Returns the next epoch-ms instant this message's reset time refers to, or
// null if `message` isn't a recognizable Claude session-limit error (either
// wrong error entirely, or the expected "resets HH:MMam/pm" clause is
// missing/unparseable) — callers fall back to treating it as a plain error.
export function parseClaudeRateLimit(message: string): number | null {
  if (!SESSION_LIMIT_RE.test(message)) return null;
  const match = RESET_TIME_RE.exec(message);
  if (!match) return null;

  const hour12 = Number(match[1]) % 12;
  const minute = Number(match[2]);
  const hour = match[3].toLowerCase() === "pm" ? hour12 + 12 : hour12;

  const now = new Date();
  const resetAt = new Date(now);
  resetAt.setHours(hour, minute, 0, 0);
  if (resetAt.getTime() <= now.getTime()) {
    resetAt.setDate(resetAt.getDate() + 1);
  }
  return resetAt.getTime();
}
