import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import { type AcpSessionOptions, api } from "../lib/tauriApi";
import { useTauriEvent } from "../lib/useTauriEvent";
import { qk } from "./keys";

// What `sessionId`'s live ACP connection offers (model and effort options,
// slash commands), or null before the first fetch. Rust owns this — the
// `AcpSession` entry in `acp_sessions` — so a chat panel that mounts after
// the connection came up just reads it; `useAcpSessionOptionsListener`
// keeps it current.
export function useAcpSessionOptions(
  sessionId: string,
): AcpSessionOptions | null {
  const { data } = useQuery({
    queryKey: qk.acpSessionOptions(sessionId),
    queryFn: () => api.getAcpSessionOptions(sessionId),
  });
  return data ?? null;
}

// Optimistic update for a pick sent to the agent, shown before the agent
// confirms it (its confirmation replaces this via the event).
export function patchAcpSessionOptions(
  sessionId: string,
  updater: (prev: AcpSessionOptions) => AcpSessionOptions,
): void {
  queryClient.setQueryData<AcpSessionOptions>(
    qk.acpSessionOptions(sessionId),
    (old) => (old ? updater(old) : old),
  );
}

// The event carries the whole snapshot, so it replaces the cached one
// outright. Mounted once in `App.tsx`.
export function useAcpSessionOptionsListener() {
  useTauriEvent<AcpSessionOptions>("acp://session-options", (payload) => {
    queryClient.setQueryData(qk.acpSessionOptions(payload.sessionId), payload);
  });
}
