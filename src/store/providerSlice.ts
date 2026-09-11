import type { StateCreator } from "zustand";
import {
  api,
  type ModelSummary,
  type ProviderConfigPayload,
} from "../lib/tauriApi";
import type { AppStore } from "./index";

const PROVIDER_CONFIG_KEY = "ai-leash:providerConfig";

export interface OllamaProviderConfig {
  kind: "ollama";
  host: string; // e.g. "localhost:11434"; "" is treated as the default
}

export interface OpenAiCompatibleProviderConfig {
  kind: "openAiCompatible";
  id: string; // stable local id, survives label edits
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string; // free-text — see docs/features/agent-chat.md on why there's no live model list for this provider kind
}

export type ProviderConfig =
  | OllamaProviderConfig
  | OpenAiCompatibleProviderConfig;

interface ProviderSettings {
  ollama: OllamaProviderConfig;
  openAiCompatible: OpenAiCompatibleProviderConfig[];
  activeId: "ollama" | string;
}

const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  ollama: { kind: "ollama", host: "localhost:11434" },
  openAiCompatible: [],
  activeId: "ollama",
};

function loadProviderSettings(): ProviderSettings {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(PROVIDER_CONFIG_KEY) ?? "null",
    );
    if (parsed && typeof parsed === "object") {
      return {
        ollama: {
          kind: "ollama",
          host: parsed.ollama?.host ?? "localhost:11434",
        },
        openAiCompatible: Array.isArray(parsed.openAiCompatible)
          ? parsed.openAiCompatible
          : [],
        activeId: parsed.activeId ?? "ollama",
      };
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_PROVIDER_SETTINGS;
}

function saveProviderSettings(settings: ProviderSettings) {
  localStorage.setItem(PROVIDER_CONFIG_KEY, JSON.stringify(settings));
}

// Narrows a `ProviderConfig` (which carries frontend-only bookkeeping like
// `id`/`label`/`model`) down to exactly the shape the backend's
// `ProviderConfig` enum expects.
function toProviderConfigPayload(
  config: ProviderConfig,
): ProviderConfigPayload {
  if (config.kind === "ollama") {
    return { kind: "ollama", host: config.host };
  }
  return {
    kind: "openAiCompatible",
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  };
}

export interface ProviderSlice {
  // Always Ollama's own list regardless of which provider any conversation
  // has active — used to populate the picker's per-model Ollama rows (see
  // ChatPanel.tsx), so it can't go empty just because some conversation
  // happens to have an OpenAI-compatible provider selected.
  ollamaModels: ModelSummary[];
  providerSettings: ProviderSettings;
  // Live reachability per configured provider, keyed by "ollama" or an
  // openAiCompatible config's `id`, refreshed regardless of which
  // conversation (if any) currently has it active — each conversation looks
  // up its own active provider's entry (see ChatPanel.tsx). `null` = not
  // checked yet.
  providerConnectivity: Record<string, boolean | null>;
  // Shared by both the provider and ACP settings tabs (`SettingsModal.tsx`).
  settingsModalOpen: boolean;
  refreshOllama: () => Promise<void>;
  refreshProviderConnectivity: () => Promise<void>;
  providerConfigFor: (activeId: string) => ProviderConfigPayload;
  setSettingsModalOpen: (open: boolean) => void;
  setOllamaHost: (host: string) => void;
  saveOpenAiCompatibleConfig: (config: OpenAiCompatibleProviderConfig) => void;
  deleteOpenAiCompatibleConfig: (id: string) => void;
  setActiveProvider: (activeId: string) => void;
}

export const providerSlice: StateCreator<AppStore, [], [], ProviderSlice> = (
  set,
  get,
) => ({
  ollamaModels: [],
  providerSettings: loadProviderSettings(),
  providerConnectivity: {},
  settingsModalOpen: false,

  refreshOllama: async () => {
    try {
      const models = await api.listProviderModels(
        toProviderConfigPayload(get().providerSettings.ollama),
      );
      set({ ollamaModels: models });
    } catch {
      set({ ollamaModels: [] });
    }
  },

  // Narrows `providerSettings` (which carries frontend-only bookkeeping like
  // `id`/`label`/`model`) down to exactly the shape the backend's
  // `ProviderConfig` enum expects, so callers can pass this straight into
  // `api.listProviderModels`/`api.sendPrompt`/`api.retryLast`. Takes the
  // provider id explicitly (`"ollama"` or an `openAiCompatible` config's
  // `id`) rather than reading a single global "active" one, since which
  // provider is active is now per-conversation (see `ChatPanel.tsx`'s own
  // `providerActiveId` state) — a global default only still exists as the
  // starting point for a conversation that's never picked one of its own.
  providerConfigFor: (activeId) => {
    const { providerSettings } = get();
    if (activeId === "ollama") {
      return toProviderConfigPayload(providerSettings.ollama);
    }
    const found = providerSettings.openAiCompatible.find(
      (c) => c.id === activeId,
    );
    return toProviderConfigPayload(found ?? providerSettings.ollama);
  },

  // Checks reachability of every configured provider (not just the active
  // one — see `providerConnectivity`'s doc comment), for the status bar's
  // aggregate indicator.
  refreshProviderConnectivity: async () => {
    const { providerSettings } = get();
    const targets: [string, ProviderConfig][] = [
      ["ollama", providerSettings.ollama],
      ...providerSettings.openAiCompatible.map(
        (c): [string, ProviderConfig] => [c.id, c],
      ),
    ];
    const results = await Promise.all(
      targets.map(async ([id, config]) => {
        try {
          const connected = await api.checkProviderConnection(
            toProviderConfigPayload(config),
          );
          return [id, connected] as const;
        } catch {
          return [id, false] as const;
        }
      }),
    );
    set((s) => ({
      providerConnectivity: {
        ...s.providerConnectivity,
        ...Object.fromEntries(results),
      },
    }));
  },

  setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),

  setOllamaHost: (host) =>
    set((s) => {
      const providerSettings = {
        ...s.providerSettings,
        ollama: { kind: "ollama" as const, host },
      };
      saveProviderSettings(providerSettings);
      return { providerSettings };
    }),

  saveOpenAiCompatibleConfig: (config) =>
    set((s) => {
      const exists = s.providerSettings.openAiCompatible.some(
        (c) => c.id === config.id,
      );
      const openAiCompatible = exists
        ? s.providerSettings.openAiCompatible.map((c) =>
            c.id === config.id ? config : c,
          )
        : [...s.providerSettings.openAiCompatible, config];
      const providerSettings = { ...s.providerSettings, openAiCompatible };
      saveProviderSettings(providerSettings);
      return { providerSettings };
    }),

  deleteOpenAiCompatibleConfig: (id) =>
    set((s) => {
      const openAiCompatible = s.providerSettings.openAiCompatible.filter(
        (c) => c.id !== id,
      );
      const activeId =
        s.providerSettings.activeId === id
          ? "ollama"
          : s.providerSettings.activeId;
      const providerSettings = {
        ...s.providerSettings,
        openAiCompatible,
        activeId,
      };
      saveProviderSettings(providerSettings);
      return { providerSettings };
    }),

  setActiveProvider: (activeId) =>
    set((s) => {
      const providerSettings = { ...s.providerSettings, activeId };
      saveProviderSettings(providerSettings);
      return { providerSettings };
    }),
});
