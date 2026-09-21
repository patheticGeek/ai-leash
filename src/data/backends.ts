import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api, type ModelSummary } from "../lib/tauriApi";
import { useAppStore } from "../store";
import { isEnabled } from "../store/backendSlice";
import {
  type ProviderConfig,
  toProviderConfigPayload,
} from "../store/providerSlice";
import { qk } from "./keys";

// Provider backends (Ollama, OpenAI-compatible): what each one can do and
// how to reach it, kept out of the chat code so `useChatSession` never has to
// know which provider it is talking to. ACP agents are still a separate
// family (`useAcpAgentCatalog`); they join this one when the Rust `Backend`
// trait lands (see PLAN.md, Phase 5).

// "live": the provider can list its models. "freeText": it can't, so the user
// types a model id (see docs/features/agent-chat.md).
export type ModelListing = "live" | "freeText";

export function providerModelListing(config: ProviderConfig): ModelListing {
  return config.kind === "ollama" ? "live" : "freeText";
}

/** What to tell the user when `config` fails its connection check. */
export function providerUnreachableMessage(config: ProviderConfig): string {
  if (config.kind === "ollama") {
    return `Could not reach Ollama at ${config.host || "localhost:11434"}. Is \`ollama serve\` running?`;
  }
  return "Could not reach the configured provider. Check the base URL and API key in provider settings.";
}

/** Every configured provider backend, enabled or not. */
export function useProviderBackends(): ProviderConfig[] {
  const settings = useAppStore((s) => s.providerSettings);
  return useMemo(
    () => [...settings.ollama, ...settings.openAiCompatible],
    [settings],
  );
}

// A model list has no push channel to invalidate on — models are pulled and
// removed outside this app — so polling is the only way to notice a change.
// Editing or deleting the config invalidates/removes it right away
// (`providerSlice.ts`).
const MODELS_REFRESH_MS = 5000;
const HEALTH_REFRESH_MS = 5000;

const NO_MODELS: ModelSummary[] = [];

/**
 * Every enabled provider's own model list, keyed by config id (a provider
 * with no model listing, or one that is unreachable, maps to `[]`). Also
 * called from `App.tsx`, an always-mounted subscriber that keeps the cache
 * warm across `CenterPanel`'s per-conversation remounts.
 */
export function useProviderModels(): Record<string, ModelSummary[]> {
  const providers = useProviderBackends();
  const listed = useMemo(
    () =>
      providers.filter(
        (c) => isEnabled(c) && providerModelListing(c) === "live",
      ),
    [providers],
  );
  return useQueries({
    queries: listed.map((config) => ({
      queryKey: qk.backendModels(config.id),
      queryFn: async () => {
        try {
          return await api.listProviderModels(toProviderConfigPayload(config));
        } catch {
          return NO_MODELS;
        }
      },
      refetchInterval: MODELS_REFRESH_MS,
    })),
    combine: (results) =>
      Object.fromEntries(
        listed.map((config, i) => [config.id, results[i]?.data ?? NO_MODELS]),
      ),
  });
}

/**
 * Whether `config` currently answers its connection check: `null` until the
 * first check lands. Polled only while something is observing it (the open
 * conversation's provider) — nothing reads the others' status.
 */
export function useProviderHealth(
  config: ProviderConfig | undefined,
): boolean | null {
  const { data } = useQuery({
    queryKey: qk.backendHealth(config?.id ?? ""),
    queryFn: async () => {
      try {
        return await api.checkProviderConnection(
          toProviderConfigPayload(config as ProviderConfig),
        );
      } catch {
        return false;
      }
    },
    enabled: !!config && isEnabled(config),
    refetchInterval: HEALTH_REFRESH_MS,
  });
  return data ?? null;
}
