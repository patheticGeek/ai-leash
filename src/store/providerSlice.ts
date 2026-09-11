import type { StateCreator } from "zustand";
import {
  api,
  type ModelSummary,
  type ProviderConfigPayload,
} from "../lib/tauriApi";
import { DEFAULT_OLLAMA_ID } from "./backendSlice";
import type { AppStore } from "./index";

const PROVIDER_CONFIG_KEY = "ai-leash:providerConfig";

export interface OllamaProviderConfig {
  kind: "ollama";
  id: string; // stable local id, survives label edits
  label: string;
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
  // A list, not a singleton — multiple independent Ollama connections (e.g.
  // "local" and "remote") are just cards like any `openAiCompatible` entry.
  // Which one (if any) a brand-new conversation starts from lives in
  // `backendSlice.ts`'s `defaultBackend`, not here.
  ollama: OllamaProviderConfig[];
  openAiCompatible: OpenAiCompatibleProviderConfig[];
}

const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  ollama: [
    {
      kind: "ollama",
      id: DEFAULT_OLLAMA_ID,
      label: "Ollama",
      host: "localhost:11434",
    },
  ],
  openAiCompatible: [],
};

function loadProviderSettings(): ProviderSettings {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(PROVIDER_CONFIG_KEY) ?? "null",
    );
    if (parsed && typeof parsed === "object") {
      let ollama: OllamaProviderConfig[];
      if (Array.isArray(parsed.ollama)) {
        ollama = parsed.ollama;
      } else if (parsed.ollama && typeof parsed.ollama === "object") {
        // Pre-multi-Ollama shape was a singleton `{kind, host}` — migrate it
        // into a one-element array, preserving the existing host and giving
        // it the same stable id/label a fresh install's default card gets,
        // so existing users' conversations (which reference this id via the
        // old `providerSettings.activeId === "ollama"` sentinel, migrated
        // separately in `backendSlice.ts`) keep resolving to the same card.
        ollama = [
          {
            kind: "ollama",
            id: DEFAULT_OLLAMA_ID,
            label: "Ollama",
            host: parsed.ollama.host ?? "localhost:11434",
          },
        ];
      } else {
        ollama = DEFAULT_PROVIDER_SETTINGS.ollama;
      }
      return {
        ollama,
        openAiCompatible: Array.isArray(parsed.openAiCompatible)
          ? parsed.openAiCompatible
          : [],
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
  // Every configured Ollama connection's own model list, keyed by that
  // config's `id` — used to populate the picker's per-model Ollama rows for
  // *each* configured connection (see `useChatSession.ts`), so a config's
  // models can't go empty or bleed into another config just because some
  // conversation happens to have a different one active.
  ollamaModelsByConfig: Record<string, ModelSummary[]>;
  providerSettings: ProviderSettings;
  // Live reachability per configured provider, keyed by an `ollama` or
  // `openAiCompatible` config's `id`, refreshed regardless of which
  // conversation (if any) currently has it active — each conversation looks
  // up its own active provider's entry (see `useChatSession.ts`). `null` =
  // not checked yet.
  providerConnectivity: Record<string, boolean | null>;
  // Shared by the settings modal's Agents tab.
  settingsModalOpen: boolean;
  refreshOllamaModels: () => Promise<void>;
  refreshProviderConnectivity: () => Promise<void>;
  providerConfigFor: (id: string) => ProviderConfigPayload;
  setSettingsModalOpen: (open: boolean) => void;
  saveOllamaConfig: (config: OllamaProviderConfig) => void;
  deleteOllamaConfig: (id: string) => void;
  saveOpenAiCompatibleConfig: (config: OpenAiCompatibleProviderConfig) => void;
  deleteOpenAiCompatibleConfig: (id: string) => void;
}

export const providerSlice: StateCreator<AppStore, [], [], ProviderSlice> = (
  set,
  get,
) => ({
  ollamaModelsByConfig: {},
  providerSettings: loadProviderSettings(),
  providerConnectivity: {},
  settingsModalOpen: false,

  refreshOllamaModels: async () => {
    const { providerSettings } = get();
    const results = await Promise.all(
      providerSettings.ollama.map(async (config) => {
        try {
          const models = await api.listProviderModels(
            toProviderConfigPayload(config),
          );
          return [config.id, models] as const;
        } catch {
          return [config.id, []] as const;
        }
      }),
    );
    set({ ollamaModelsByConfig: Object.fromEntries(results) });
  },

  // Narrows `providerSettings` (which carries frontend-only bookkeeping like
  // `id`/`label`/`model`) down to exactly the shape the backend's
  // `ProviderConfig` enum expects, so callers can pass this straight into
  // `api.listProviderModels`/`api.sendPrompt`/`api.retryLast`. Takes the
  // provider id explicitly (an `ollama` or `openAiCompatible` config's `id`)
  // rather than reading a single global "active" one, since which provider
  // is active is now per-conversation (see `useChatSession.ts`'s own
  // `providerActiveId` state) — a global default only still exists as the
  // starting point for a conversation that's never picked one of its own
  // (see `backendSlice.ts`'s `defaultBackend`).
  providerConfigFor: (id) => {
    const { providerSettings } = get();
    const ollama = providerSettings.ollama.find((c) => c.id === id);
    if (ollama) return toProviderConfigPayload(ollama);
    const openAi = providerSettings.openAiCompatible.find((c) => c.id === id);
    if (openAi) return toProviderConfigPayload(openAi);
    // Defensive fallback for a stale id (e.g. a since-deleted config) —
    // falls back to the first configured Ollama connection.
    return toProviderConfigPayload(
      providerSettings.ollama[0] ?? DEFAULT_PROVIDER_SETTINGS.ollama[0],
    );
  },

  // Checks reachability of every configured provider (not just the active
  // one — see `providerConnectivity`'s doc comment), for the status bar's
  // aggregate indicator.
  refreshProviderConnectivity: async () => {
    const { providerSettings } = get();
    const targets: [string, ProviderConfig][] = [
      ...providerSettings.ollama.map((c): [string, ProviderConfig] => [
        c.id,
        c,
      ]),
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

  saveOllamaConfig: (config) =>
    set((s) => {
      const exists = s.providerSettings.ollama.some((c) => c.id === config.id);
      const ollama = exists
        ? s.providerSettings.ollama.map((c) =>
            c.id === config.id ? config : c,
          )
        : [...s.providerSettings.ollama, config];
      const providerSettings = { ...s.providerSettings, ollama };
      saveProviderSettings(providerSettings);
      return { providerSettings };
    }),

  deleteOllamaConfig: (id) => {
    set((s) => {
      const ollama = s.providerSettings.ollama.filter((c) => c.id !== id);
      const providerSettings = { ...s.providerSettings, ollama };
      saveProviderSettings(providerSettings);
      const ollamaModelsByConfig = Object.fromEntries(
        Object.entries(s.ollamaModelsByConfig).filter(
          ([configId]) => configId !== id,
        ),
      );
      return { providerSettings, ollamaModelsByConfig };
    });
    get().reconcileDefaultBackend();
  },

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

  deleteOpenAiCompatibleConfig: (id) => {
    set((s) => {
      const openAiCompatible = s.providerSettings.openAiCompatible.filter(
        (c) => c.id !== id,
      );
      const providerSettings = { ...s.providerSettings, openAiCompatible };
      saveProviderSettings(providerSettings);
      return { providerSettings };
    });
    get().reconcileDefaultBackend();
  },
});
