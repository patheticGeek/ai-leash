import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcpAgentCatalogEntry } from "./tauriApi";
import { api } from "./tauriApi";
import { useTauriEvent } from "./useTauriEvent";

export const acpCatalogQueryKey = ["acp-agent-catalog"] as const;

// Rust-authoritative ACP agent/model catalog — populated from disk at
// startup (before the frontend even boots) and kept fresh by a background
// refresh once a project root exists (see `acp::refresh_acp_catalog_in_background`
// and `AppState.acp_agent_catalog`'s doc comment). Replaces the old
// frontend-only `acpModelCache` (localStorage, in-memory-only Rust mirror).
export function useAcpAgentCatalog(): AcpAgentCatalogEntry[] {
  return useAcpAgentCatalogQuery().data ?? [];
}

// Full query result, for the one caller (`App.tsx`'s "seed any never-yet-
// discovered agent" effect) that needs to tell "hasn't loaded yet" apart
// from "loaded, and genuinely has nothing for this agent" — treating the
// two the same would fire a redundant on-demand discovery for an agent
// Rust's own background refresh already has covered, just because the
// first fetch hadn't resolved yet.
export function useAcpAgentCatalogQuery() {
  return useQuery({
    queryKey: acpCatalogQueryKey,
    queryFn: () => api.getAcpAgentCatalog(),
  });
}

// Invalidates the catalog query whenever Rust's background refresh (or an
// on-demand `sync_acp_agent_catalog` call) changes it — called once from
// the always-mounted `App.tsx`, same pattern as `useFsChangeInvalidator`/
// `useGeneratingListener`.
export function useAcpCatalogInvalidator() {
  const queryClient = useQueryClient();
  useTauriEvent("acp://catalog-updated", () => {
    queryClient.invalidateQueries({ queryKey: acpCatalogQueryKey });
  });
}
