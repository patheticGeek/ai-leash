import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../data/keys";
import type { AcpAgentCatalogEntry } from "./tauriApi";
import { api } from "./tauriApi";
import { useTauriEvent } from "./useTauriEvent";

// Rust-owned ACP agent/model catalog — built from the backend registry's
// enabled ACP agents (`acp::sync_catalog_with_registry`), with each agent's
// models and effort levels discovered and refreshed by Rust itself.
export function useAcpAgentCatalog(): AcpAgentCatalogEntry[] {
  const { data } = useQuery({
    queryKey: qk.acpCatalog,
    queryFn: () => api.getAcpAgentCatalog(),
  });
  return data ?? NO_ENTRIES;
}

const NO_ENTRIES: AcpAgentCatalogEntry[] = [];

// Invalidates the catalog query whenever Rust changes it — called once from
// the always-mounted `App.tsx`, same pattern as `useFsChangeInvalidator`/
// `useGeneratingListener`.
export function useAcpCatalogInvalidator() {
  const queryClient = useQueryClient();
  useTauriEvent("acp://catalog-updated", () => {
    queryClient.invalidateQueries({ queryKey: qk.acpCatalog });
  });
}
