import { useQueries } from "@tanstack/react-query";
import { qk } from "../data/keys";
import {
  type OllamaProviderConfig,
  toProviderConfigPayload,
} from "../store/providerSlice";
import type { ModelSummary } from "./tauriApi";
import { api } from "./tauriApi";

// Ollama has no push/event mechanism to invalidate on — models are
// pulled/removed directly by the user outside this app — so periodic
// refetch is the only way to notice a change. `saveOllamaConfig`/
// `deleteOllamaConfig` (`providerSlice.ts`) still invalidate/remove the
// affected config's entry immediately for the cases that *do* have a
// clear trigger (host edited, config deleted).
const REFRESH_INTERVAL_MS = 5000;

// Returns every configured Ollama connection's own model list, keyed by
// that config's `id` — mirrors the old `ollamaModelsByConfig` store field
// this replaces, so a config's models can't go empty or bleed into
// another config just because some conversation happens to have a
// different one active. Called both from `App.tsx` (an always-mounted
// subscriber that keeps the cache warm across `CenterPanel`'s
// per-conversation remounts, same reasoning as `useAcpAgentCatalogQuery`
// there) and from `useChatSession.ts` (to actually read the data for the
// active conversation's picker).
export function useOllamaModelsByConfig(
  configs: OllamaProviderConfig[],
): Record<string, ModelSummary[]> {
  const results = useQueries({
    queries: configs.map((config) => ({
      queryKey: qk.ollamaModels(config.id),
      queryFn: async () => {
        try {
          return await api.listProviderModels(toProviderConfigPayload(config));
        } catch {
          return [];
        }
      },
      refetchInterval: REFRESH_INTERVAL_MS,
    })),
  });
  const byConfig: Record<string, ModelSummary[]> = {};
  configs.forEach((config, i) => {
    byConfig[config.id] = results[i]?.data ?? [];
  });
  return byConfig;
}
