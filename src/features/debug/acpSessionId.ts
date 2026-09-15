import type { AcpDebugEvent } from "../../store";

const SESSION_ID_EVENTS = new Set(["session/new/response", "session/load"]);

/**
 * Best-effort lookup of the ACP protocol's own session id (assigned by the
 * external agent) for a given conversation, derived from already-captured
 * debug events rather than any extra plumbing — the id shows up verbatim as
 * `payload.sessionId` on the `session/new` response (a fresh session) and on
 * the `session/load` request itself (resuming one), and both use the same
 * field name (`SessionId` is `#[serde(transparent)]` over a plain string in
 * the ACP schema). Undefined until debug mode has been on for at least one
 * of those events for this conversation.
 */
export function latestAcpSessionId(
  events: AcpDebugEvent[],
  conversationId: string | null,
): string | undefined {
  if (!conversationId) return undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const item = events[i];
    if (item.sessionId !== conversationId) continue;
    if (!SESSION_ID_EVENTS.has(item.event)) continue;
    const payload = item.payload;
    if (
      payload &&
      typeof payload === "object" &&
      "sessionId" in payload &&
      typeof (payload as { sessionId?: unknown }).sessionId === "string"
    ) {
      return (payload as { sessionId: string }).sessionId;
    }
  }
  return undefined;
}
