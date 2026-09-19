import { useEffect, useState } from "react";
import { api, type ProviderConfigPayload } from "../../../lib/tauriApi";

// Connects the ACP agent's subprocess as soon as one's active for this
// conversation, rather than waiting for the first `send()` — see
// `warm_acp_session`'s doc comment. This is what lets a `session/load`
// resume failure surface (as `acp_session_restore_failed`, handled in
// `useChatStream`) before there's a typed message `send()` could strand: it
// clears the input optimistically as soon as it's called.
//
// `reconnect()` re-triggers the same connect — after a resume failure
// ("Start new session" in `TranscriptNotices`; the backend's already dropped
// the stale session id by then, see `drive_acp_connection`, so this goes
// straight to a fresh `session/new`), after `/clear`, and after a worktree
// is picked.
export function useAcpWarmup({
  sessionId,
  isAcp,
  launchCommand,
  providerActiveId,
  providerConfigFor,
  model,
}: {
  sessionId: string;
  isAcp: boolean;
  launchCommand: string | undefined;
  providerActiveId: string;
  providerConfigFor: (id: string) => ProviderConfigPayload;
  model: string;
}) {
  const [nonce, setNonce] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce isn't read in the body, it's a trigger-only dep to force a retry — see doc comment above
  useEffect(() => {
    if (!isAcp || !launchCommand) return;
    api
      .warmAcpSession(
        sessionId,
        launchCommand,
        providerConfigFor(providerActiveId),
        model,
      )
      .catch(() => {});
  }, [
    isAcp,
    launchCommand,
    sessionId,
    providerActiveId,
    providerConfigFor,
    model,
    nonce,
  ]);

  return { reconnect: () => setNonce((n) => n + 1) };
}
