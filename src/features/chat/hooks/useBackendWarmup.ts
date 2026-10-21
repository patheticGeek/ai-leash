import { useEffect, useState } from "react";
import type { ChatBackend } from "../chatBackend";

// Connects a backend that supports it (`caps.warmup` — an ACP agent's
// subprocess) as soon as it's picked for this conversation, rather than
// waiting for the first message — see `Backend::warm`'s doc comment. This
// is what lets a `session/load` resume failure surface (as
// `acp_session_restore_failed`, handled in `useChatStream`) before there's a
// typed message a send could strand: the composer clears the input as soon as
// it sends.
//
// `reconnect()` re-triggers the same connect — after a resume failure
// ("Start new session" in `TranscriptNotices`; the backend's already dropped
// the stale session id by then, see `drive_acp_connection`, so this goes
// straight to a fresh `session/new`) and after `/clear`.
//
// Never for a still-unsent new thread (`sessionId` null): connecting would
// start an agent session for a thread that may never be used. Its pickers
// read the cached catalog instead, and its first send connects (applying its
// picks — see `AcpBackend::send`).
export function useBackendWarmup(
  sessionId: string | null,
  backend: ChatBackend,
) {
  const [nonce, setNonce] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce isn't read in the body, it's a trigger-only dep to force a retry — see doc comment above
  useEffect(() => {
    if (!sessionId || !backend.caps.warmup || !backend.ready) return;
    backend.warm(sessionId).catch(() => {});
  }, [backend, sessionId, nonce]);

  return { reconnect: () => setNonce((n) => n + 1) };
}
