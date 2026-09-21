import type { StateCreator } from "zustand";
import { acpCatalogQueryKey } from "../lib/acpCatalogQuery";
import { LS_KEYS } from "../lib/localStorageKeys";
import { queryClient } from "../lib/queryClient";
import {
  type AcpAgentCatalogEntry,
  type AcpAgentOptions,
  api,
} from "../lib/tauriApi";
import { isEnabled } from "./backendSlice";
import type { AppStore } from "./index";
import { localStorageJson } from "./localStorageJson";

// One global agent backend setting (not per-project), same reasoning as
// `providerSettings` — a session's chat "just uses whatever's active".
// External ACP support replaces the entire built-in agent loop for a
// session rather than varying which HTTP API a turn's model call goes to
// (that's what `ProviderConfig` is for) — see docs/features/agent-chat.md.
// Multiple ACP agents can be saved (e.g. Claude Code and Copilot side by
// side) — same list/activeId shape as `providerSettings.openAiCompatible`.
export interface AcpAgentConfig {
  id: string; // stable local id, survives label edits
  label: string;
  launchCommand: string; // shell-style command line, e.g. "npx -y @agentclientprotocol/claude-agent-acp@latest"
  enabled?: boolean; // absent = on — see `isEnabled` in `backendSlice.ts`
}

export interface AgentBackendSettings {
  acpAgents: AcpAgentConfig[];
}

// Known-good launch commands for ACP agents most users already have
// installed and authenticated via their own CLI login (see plan.md's
// research notes) — shown in the saved-agents list by default rather than
// behind a separate "quick add" affordance, so they're discoverable without
// an extra click. Matched by `launchCommand` (not `id`) against whatever's
// already saved, so this never creates a duplicate of an entry the user
// added (or edited) themselves.
const DEFAULT_ACP_PRESETS: AcpAgentConfig[] = [
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

function withDefaultAcpAgents(agents: AcpAgentConfig[]): AcpAgentConfig[] {
  const missing = DEFAULT_ACP_PRESETS.filter(
    (preset) => !agents.some((a) => a.launchCommand === preset.launchCommand),
  );
  return [...agents, ...missing];
}

// Not store state — this only dedupes concurrent `fetchAcpModelsFor` calls
// for the same agent, it doesn't need to be reactive.
const acpModelFetchesInFlight = new Set<string>();

const DEFAULT_AGENT_BACKEND: AgentBackendSettings = {
  acpAgents: DEFAULT_ACP_PRESETS,
};

function loadAgentBackend(): AgentBackendSettings {
  // biome-ignore lint/suspicious/noExplicitAny: shape is validated below field-by-field
  const parsed = localStorageJson.read<any>(LS_KEYS.agentBackend, null);
  if (parsed && typeof parsed === "object") {
    // Pre-multi-agent shape was `{kind: "acp", launchCommand}` — migrate
    // it into a single saved entry (seeding the presets alongside it too,
    // as a one-time thing) so existing users don't lose their setup.
    if (
      parsed.kind === "acp" &&
      typeof parsed.launchCommand === "string" &&
      !Array.isArray(parsed.acpAgents)
    ) {
      return {
        acpAgents: withDefaultAcpAgents([
          {
            id: crypto.randomUUID(),
            label: "ACP agent",
            launchCommand: parsed.launchCommand,
          },
        ]),
      };
    }
    // Once a real `acpAgents` array has been saved, it's authoritative
    // as-is — no re-seeding here, or deleting a default preset would
    // silently bring it back on the next reload. Any `kind`/`activeAcpId`
    // left over from the pre-unified-default shape are ignored here — the
    // shared default backend now lives entirely in `backendSlice.ts`,
    // migrated once from these same raw keys (see that file's
    // `migrateFromOldKeys`).
    if (Array.isArray(parsed.acpAgents)) {
      return { acpAgents: parsed.acpAgents };
    }
  }
  return DEFAULT_AGENT_BACKEND;
}

function saveAgentBackend(backend: AgentBackendSettings) {
  localStorageJson.write(LS_KEYS.agentBackend, backend);
}

// Pushes `agents` to the Rust catalog (`acp::sync_acp_agent_catalog`),
// preserving each surviving agent's already-known `modelOptions`/
// `effortOptions` by reading the catalog back first — `sync_acp_agent_catalog`
// replaces the whole list wholesale, so anything not included here would be
// dropped rather than left alone. `override`, if given, replaces one
// specific agent's options outright (the just-fetched result), rather than
// whatever's currently cached for it. Rust is the sole source of truth for
// this data now (`useAcpAgentCatalog`, `src/lib/acpCatalogQuery.ts`) — this
// is fire-and-forget/best effort, a failed push just means the backend is
// briefly stale, not anything worth surfacing to the user.
async function pushAcpCatalog(
  agents: AcpAgentConfig[],
  override?: { id: string; options: AcpAgentOptions },
) {
  const current = await api
    .getAcpAgentCatalog()
    .catch<AcpAgentCatalogEntry[]>(() => []);
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  // A switched-off agent stays out of the Rust catalog, so its background
  // refresh never spawns it. Switching it back on re-seeds it through
  // `App.tsx`'s missing-from-catalog discovery effect.
  const merged: AcpAgentCatalogEntry[] = agents
    .filter(isEnabled)
    .map((agent) => {
      const options =
        override && override.id === agent.id
          ? override.options
          : {
              model: byId.get(agent.id)?.modelOptions ?? null,
              effort: byId.get(agent.id)?.effortOptions ?? null,
            };
      return {
        id: agent.id,
        label: agent.label,
        launchCommand: agent.launchCommand,
        modelOptions: options.model,
        effortOptions: options.effort,
      };
    });
  await api.syncAcpAgentCatalog(merged);
  // `sync_acp_agent_catalog` doesn't emit `acp://catalog-updated` itself
  // (that event is only for Rust's own background refresh) — without this,
  // a just-discovered agent's models wouldn't show up in the picker until
  // the query's `staleTime` happened to lapse on its own.
  queryClient.setQueryData(acpCatalogQueryKey, merged);
}

// Which provider/agent (and which specific model) a given conversation is
// actually using — kept per-session-id so switching conversations restores
// what that one last used instead of showing whatever any other
// conversation most recently touched. `backendSlice.ts`'s `defaultBackend`
// still exists as the *default* a brand-new conversation starts from (and
// `useChatSession.ts` keeps it in sync with the most recent pick, so new
// conversations inherit something sensible) — once a conversation has one
// of these, it's authoritative for that conversation from then on,
// regardless of what changes elsewhere.
export interface ConversationBackendSelection {
  kind: "builtin" | "acp";
  providerActiveId: string; // "ollama" | openAiCompatible config id — meaningful when kind === "builtin"
  acpActiveId: string | null; // meaningful when kind === "acp"
  model: string; // Ollama model name, or free-text OpenAI-compatible model id
  acpModel: string | null; // last explicitly chosen model for the active ACP agent, if any
  acpEffort: string | null; // last explicitly chosen thought level for the active ACP agent, if any
}

function loadConversationBackend(): Record<
  string,
  ConversationBackendSelection
> {
  const parsed = localStorageJson.read<unknown>(
    LS_KEYS.conversationBackend,
    {},
  );
  return parsed && typeof parsed === "object"
    ? (parsed as Record<string, ConversationBackendSelection>)
    : {};
}

function saveConversationBackendMap(
  map: Record<string, ConversationBackendSelection>,
) {
  localStorageJson.write(LS_KEYS.conversationBackend, map);
}

export interface AcpSlice {
  agentBackend: AgentBackendSettings;
  // Per-conversation backend/model choice, keyed by session id — see
  // `ConversationBackendSelection`'s doc comment.
  conversationBackend: Record<string, ConversationBackendSelection>;
  saveAcpAgentConfig: (config: AcpAgentConfig) => void;
  deleteAcpAgentConfig: (id: string) => void;
  // On-demand discovery for one agent — briefly spawns and discards a real
  // connection to it (`api.fetchAcpModels`), then pushes the result into
  // the Rust catalog (`pushAcpCatalog`). Called after adding/editing an
  // agent in Settings (`saveAcpAgentConfig`, below); reading the result
  // back out goes through `useAcpAgentCatalog()`
  // (`src/lib/acpCatalogQuery.ts`), not this store — Rust is the sole
  // source of truth for discovered models now, persisted to disk and kept
  // fresh across restarts by its own background refresh.
  fetchAcpModelsFor: (agentId: string) => Promise<void>;
  setConversationBackend: (
    sessionId: string,
    selection: ConversationBackendSelection,
  ) => void;
  // Drops a deleted conversation's saved backend/model choice — called by
  // `conversationSlice.deleteConversation` so removing a conversation for
  // good doesn't leave a permanent, never-read-again entry in this map's
  // localStorage-backed persistence.
  forgetConversationBackend: (sessionId: string) => void;
}

export const acpSlice: StateCreator<AppStore, [], [], AcpSlice> = (
  set,
  get,
) => ({
  agentBackend: loadAgentBackend(),
  conversationBackend: loadConversationBackend(),

  saveAcpAgentConfig: (config) => {
    let commandChanged = true;
    set((s) => {
      const existing = s.agentBackend.acpAgents.find((c) => c.id === config.id);
      commandChanged =
        !existing || existing.launchCommand !== config.launchCommand;
      const acpAgents = existing
        ? s.agentBackend.acpAgents.map((c) => (c.id === config.id ? config : c))
        : [...s.agentBackend.acpAgents, config];
      const agentBackend = { ...s.agentBackend, acpAgents };
      saveAgentBackend(agentBackend);
      return { agentBackend };
    });
    // A changed launch command invalidates whatever's cached for the old
    // one — `fetchAcpModelsFor` re-discovers and pushes fresh options for
    // just this agent. An unchanged command (a label-only edit) still needs
    // its label pushed, but has nothing to re-discover.
    if (commandChanged && isEnabled(config)) {
      get().fetchAcpModelsFor(config.id);
    } else {
      void pushAcpCatalog(get().agentBackend.acpAgents);
    }
    get().reconcileDefaultBackend();
  },

  deleteAcpAgentConfig: (id) => {
    set((s) => {
      const acpAgents = s.agentBackend.acpAgents.filter((c) => c.id !== id);
      const agentBackend = { ...s.agentBackend, acpAgents };
      saveAgentBackend(agentBackend);
      return { agentBackend };
    });
    void pushAcpCatalog(get().agentBackend.acpAgents);
    get().reconcileDefaultBackend();
  },

  fetchAcpModelsFor: async (agentId) => {
    if (acpModelFetchesInFlight.has(agentId)) return;
    const agent = get().agentBackend.acpAgents.find((c) => c.id === agentId);
    if (!agent || !isEnabled(agent)) return;
    acpModelFetchesInFlight.add(agentId);
    try {
      const options = await api
        .fetchAcpModels(agent.launchCommand)
        .catch<AcpAgentOptions>(() => ({ model: null, effort: null }));
      await pushAcpCatalog(get().agentBackend.acpAgents, {
        id: agentId,
        options,
      });
    } finally {
      acpModelFetchesInFlight.delete(agentId);
    }
  },

  setConversationBackend: (sessionId, selection) =>
    set((s) => {
      const conversationBackend = {
        ...s.conversationBackend,
        [sessionId]: selection,
      };
      saveConversationBackendMap(conversationBackend);
      return { conversationBackend };
    }),

  forgetConversationBackend: (sessionId) =>
    set((s) => {
      if (!(sessionId in s.conversationBackend)) return s;
      const conversationBackend = { ...s.conversationBackend };
      delete conversationBackend[sessionId];
      saveConversationBackendMap(conversationBackend);
      return { conversationBackend };
    }),
});
