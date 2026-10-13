import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { LS_KEYS } from "../lib/localStorageKeys";
import { queryClient } from "../lib/queryClient";
import {
  api,
  type BackendConfig,
  type BackendRegistry,
  type ModelSummary,
} from "../lib/tauriApi";
import { useTauriEvent } from "../lib/useTauriEvent";
import { qk } from "./keys";

// Every kind of backend that can answer a chat, and what each one can do —
// the frontend counterpart of Rust's `Backend` trait and `Capabilities`
// (`src-tauri/src/backend/mod.rs`). This table is the one place a kind's
// abilities are written down: chat code asks `caps`, never which kind it
// has (see `features/chat/chatBackend.ts` for the operations).
export type BackendKind = BackendConfig["kind"];

export interface BackendCapabilities {
  // The model picker lists this backend's models.
  modelListing: boolean;
  // No model list: the user types a model id instead.
  freeTextModel: boolean;
  // Runs its own agent loop (and history) in a subprocess — ACP.
  ownsAgentLoop: boolean;
  // "Retry" on the last message re-runs the turn.
  retry: boolean;
  // "/compact" summarizes the conversation.
  compaction: boolean;
  // Offers a reasoning-effort picker (options come from the agent itself).
  effortPicker: boolean;
  // Connects ahead of the first message, so a failed resume shows before
  // anything is typed.
  warmup: boolean;
  // Checked for reachability while a conversation uses it.
  healthCheck: boolean;
}

export const BACKEND_CAPABILITIES: Record<BackendKind, BackendCapabilities> = {
  ollama: {
    modelListing: true,
    freeTextModel: false,
    ownsAgentLoop: false,
    retry: true,
    compaction: true,
    effortPicker: false,
    warmup: false,
    healthCheck: true,
  },
  openAiCompatible: {
    modelListing: false,
    freeTextModel: true,
    ownsAgentLoop: false,
    retry: true,
    compaction: true,
    effortPicker: false,
    warmup: false,
    healthCheck: true,
  },
  acp: {
    modelListing: true,
    freeTextModel: false,
    ownsAgentLoop: true,
    retry: false,
    compaction: false,
    effortPicker: true,
    warmup: true,
    healthCheck: false,
  },
};

/** What to tell the user when `config` fails its connection check. */
export function unreachableMessage(config: BackendConfig): string {
  if (config.kind === "ollama") {
    return `Could not reach Ollama at ${config.host || "localhost:11434"}. Is \`ollama serve\` running?`;
  }
  return "Could not reach the configured provider. Check the base URL and API key in provider settings.";
}

// ---- The registry ----------------------------------------------------------

// Rust owns the registry (`backend::registry`, `backends.json`). It's loaded
// before the first render (`bootBackends`), changed only through the
// functions below, and kept current by `useBackendsListener` — so the query
// never refetches on its own.
function useRegistry(): BackendRegistry {
  const { data } = useQuery({
    queryKey: qk.backends,
    queryFn: () => api.getBackends(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  if (!data) throw new Error("backends were read before bootBackends() ran");
  return data;
}

/** Every configured backend, enabled or not, in Settings order. */
export function useBackends(): BackendConfig[] {
  return useRegistry().backends;
}

/**
 * Why API keys are in the settings file instead of the OS keychain, if they
 * are — null when every key is in the keychain.
 */
export function useKeyStorageError(): string | null {
  return useRegistry().keyStorageError ?? null;
}

/** The backend a brand-new conversation starts on. */
export function useDefaultBackendId(): string {
  return useRegistry().defaultBackendId;
}

/** For code outside React. Only valid after `bootBackends`. */
export function getRegistry(): BackendRegistry {
  const data = queryClient.getQueryData<BackendRegistry>(qk.backends);
  if (!data) throw new Error("backends were read before bootBackends() ran");
  return data;
}

function applyRegistry(registry: BackendRegistry) {
  queryClient.setQueryData(qk.backends, registry);
}

export async function saveBackend(config: BackendConfig): Promise<void> {
  applyRegistry(await api.saveBackend(config));
  // An edited host, URL or key can change what it lists and whether it
  // answers.
  void queryClient.invalidateQueries({ queryKey: qk.backend(config.id) });
}

export async function deleteBackend(id: string): Promise<void> {
  applyRegistry(await api.deleteBackend(id));
  queryClient.removeQueries({ queryKey: qk.backend(id) });
}

export async function setDefaultBackend(id: string): Promise<void> {
  applyRegistry(await api.setDefaultBackend(id));
}

// The payload is the whole registry, so it replaces the cache outright —
// covers Rust's own writes too (it remembers the last model used on a
// backend). Mounted once in `App.tsx`.
export function useBackendsListener() {
  useTauriEvent<BackendRegistry>("backends://changed", applyRegistry);
}

// Loads the registry before the first render. On the first launch of a build
// with the registry, it imports what the frontend used to keep in
// localStorage, then drops those keys.
export async function bootBackends(): Promise<void> {
  const snapshot = await api.getBackends();
  const legacy = snapshot.persisted ? null : readLegacyRegistry();
  if (legacy) {
    applyRegistry(await api.importBackends(legacy));
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } else {
    const { persisted: _, ...registry } = snapshot;
    applyRegistry(registry);
  }
}

const LEGACY_KEYS = [
  LS_KEYS.providerConfig,
  LS_KEYS.agentBackend,
  LS_KEYS.defaultBackend,
  LS_KEYS.lastModel,
];

function readLegacyJson(key: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// Every shape the old `providerSlice`/`acpSlice`/`backendSlice` accepted,
// mapped onto registry entries. Null when there's nothing to import (a fresh
// install), which leaves Rust's own defaults in place.
function readLegacyRegistry(): BackendRegistry | null {
  const provider = readLegacyJson(LS_KEYS.providerConfig);
  const agent = readLegacyJson(LS_KEYS.agentBackend);
  const defaultRef = readLegacyJson(LS_KEYS.defaultBackend);
  if (!provider && !agent && !defaultRef) return null;
  const lastModel = localStorage.getItem(LS_KEYS.lastModel) ?? "";
  const str = (v: unknown, fallback = "") =>
    typeof v === "string" ? v : fallback;
  const on = (v: unknown) => v !== false;
  const list = (v: unknown) =>
    Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

  // A singleton `{host}` predates multiple Ollama connections.
  const ollama = Array.isArray(provider?.ollama)
    ? list(provider?.ollama)
    : [
        {
          id: DEFAULT_OLLAMA_ID,
          label: "Ollama",
          host:
            str((provider?.ollama as { host?: unknown })?.host) ||
            "localhost:11434",
        },
      ];
  // `{kind: "acp", launchCommand}` predates multiple ACP agents.
  const acp: Record<string, unknown>[] = Array.isArray(agent?.acpAgents)
    ? list(agent?.acpAgents)
    : [
        ...(agent?.kind === "acp" && typeof agent.launchCommand === "string"
          ? [
              {
                id: crypto.randomUUID(),
                label: "ACP agent",
                launchCommand: agent.launchCommand,
              },
            ]
          : []),
        ...ACP_PRESETS,
      ];

  const backends: BackendConfig[] = [
    ...ollama.map((c) => ({
      kind: "ollama" as const,
      id: str(c.id),
      label: str(c.label, "Ollama"),
      enabled: on(c.enabled),
      host: str(c.host),
      model: lastModel,
    })),
    ...acp.map((c) => ({
      kind: "acp" as const,
      id: str(c.id),
      label: str(c.label, "ACP agent"),
      enabled: on(c.enabled),
      launchCommand: str(c.launchCommand),
    })),
    ...list(provider?.openAiCompatible).map((c) => ({
      kind: "openAiCompatible" as const,
      id: str(c.id),
      label: str(c.label, "OpenAI-compatible"),
      enabled: on(c.enabled),
      baseUrl: str(c.baseUrl),
      apiKey: str(c.apiKey),
      apiKeySaved: false,
      model: str(c.model),
    })),
  ].filter((b) => b.id);

  // The unified default, else the pre-unified trio it replaced ("ollama"
  // was the old singleton's sentinel id). Rust reconciles a dangling one.
  const defaultBackendId =
    str(defaultRef?.providerId) ||
    str(defaultRef?.acpId) ||
    (agent?.kind === "acp" ? str(agent.activeAcpId) : "") ||
    (provider?.activeId === "ollama"
      ? DEFAULT_OLLAMA_ID
      : str(provider?.activeId)) ||
    DEFAULT_OLLAMA_ID;
  return { backends, defaultBackendId };
}

const DEFAULT_OLLAMA_ID = "ollama-default";

const ACP_PRESETS = [
  {
    id: "acp-preset-claude-code",
    label: "Claude Code",
    launchCommand: "npx -y @agentclientprotocol/claude-agent-acp@latest",
  },
  {
    id: "acp-preset-github-copilot",
    label: "GitHub Copilot",
    launchCommand: "copilot --acp",
  },
];

// ---- Per-backend live data -------------------------------------------------

// A model list has no push channel to invalidate on — models are pulled and
// removed outside this app — so polling is the only way to notice a change.
// Editing or deleting the backend invalidates/removes it right away.
const MODELS_REFRESH_MS = 5000;
const HEALTH_REFRESH_MS = 5000;

const NO_MODELS: ModelSummary[] = [];

/**
 * Every enabled native backend's own model list, keyed by backend id (one
 * without a model list, or that is unreachable, maps to `[]`). An ACP
 * agent's models come from the ACP catalog instead. Also called from
 * `App.tsx`, an always-mounted subscriber that keeps the cache warm across
 * `CenterPanel`'s per-conversation remounts.
 */
export function useBackendModels(): Record<string, ModelSummary[]> {
  const backends = useBackends();
  const listed = useMemo(
    () =>
      backends.filter(
        (b) =>
          b.enabled &&
          b.kind !== "acp" &&
          BACKEND_CAPABILITIES[b.kind].modelListing,
      ),
    [backends],
  );
  return useQueries({
    queries: listed.map((b) => ({
      queryKey: qk.backendModels(b.id),
      queryFn: async () => {
        try {
          return await api.listBackendModels(b.id);
        } catch {
          return NO_MODELS;
        }
      },
      refetchInterval: MODELS_REFRESH_MS,
    })),
    combine: (results) =>
      Object.fromEntries(
        listed.map((b, i) => [b.id, results[i]?.data ?? NO_MODELS]),
      ),
  });
}

/**
 * Whether `config` currently answers its connection check: `null` until the
 * first check lands, or for a backend that isn't checked. Polled only while
 * something is observing it (the open conversation's backend).
 */
export function useBackendHealth(
  config: BackendConfig | undefined,
): boolean | null {
  const { data } = useQuery({
    queryKey: qk.backendHealth(config?.id ?? ""),
    queryFn: async () => {
      try {
        return await api.checkBackendConnection(config?.id ?? "");
      } catch {
        return false;
      }
    },
    enabled:
      !!config &&
      config.enabled &&
      BACKEND_CAPABILITIES[config.kind].healthCheck,
    refetchInterval: HEALTH_REFRESH_MS,
  });
  return data ?? null;
}
