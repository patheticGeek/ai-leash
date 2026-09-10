import type { StateCreator } from "zustand";
import { type AcpModelOptions, api } from "../lib/tauriApi";
import type { AppStore } from "./index";

const AGENT_BACKEND_KEY = "ai-leash:agentBackend";

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
}

export interface AgentBackendSettings {
  kind: "builtin" | "acp";
  acpAgents: AcpAgentConfig[];
  activeAcpId: string | null; // id into acpAgents; null if none saved yet
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
// for the same agent (e.g. `refreshAcpModelCache`'s `Promise.all` racing
// against a popover open), it doesn't need to be reactive.
const acpModelFetchesInFlight = new Set<string>();

const DEFAULT_AGENT_BACKEND: AgentBackendSettings = {
  kind: "builtin",
  acpAgents: DEFAULT_ACP_PRESETS,
  activeAcpId: null,
};

function loadAgentBackend(): AgentBackendSettings {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(AGENT_BACKEND_KEY) ?? "null",
    );
    if (parsed && typeof parsed === "object") {
      // Pre-multi-agent shape was `{kind: "acp", launchCommand}` — migrate
      // it into a single saved entry (seeding the presets alongside it too,
      // as a one-time thing) so existing users don't lose their setup.
      if (
        parsed.kind === "acp" &&
        typeof parsed.launchCommand === "string" &&
        !Array.isArray(parsed.acpAgents)
      ) {
        const id = crypto.randomUUID();
        return {
          kind: "acp",
          acpAgents: withDefaultAcpAgents([
            { id, label: "ACP agent", launchCommand: parsed.launchCommand },
          ]),
          activeAcpId: id,
        };
      }
      if (parsed.kind === "acp" || parsed.kind === "builtin") {
        // Once a real `acpAgents` array has been saved, it's authoritative
        // as-is — no re-seeding here, or deleting a default preset would
        // silently bring it back on the next reload.
        return {
          kind: parsed.kind,
          acpAgents: Array.isArray(parsed.acpAgents)
            ? parsed.acpAgents
            : withDefaultAcpAgents([]),
          activeAcpId: parsed.activeAcpId ?? null,
        };
      }
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_AGENT_BACKEND;
}

function saveAgentBackend(backend: AgentBackendSettings) {
  localStorage.setItem(AGENT_BACKEND_KEY, JSON.stringify(backend));
}

const CONVERSATION_BACKEND_KEY = "ai-leash:conversationBackend";

// Which provider/agent (and which specific model) a given conversation is
// actually using — kept per-session-id so switching conversations restores
// what that one last used instead of showing whatever any other
// conversation most recently touched. `providerSettings.activeId` and
// `agentBackend.kind`/`activeAcpId` still exist as the *default* a
// brand-new conversation starts from (and `ChatPanel.tsx` keeps them in
// sync with the most recent pick, so new conversations inherit something
// sensible) — once a conversation has one of these, it's authoritative for
// that conversation from then on, regardless of what changes elsewhere.
export interface ConversationBackendSelection {
  kind: "builtin" | "acp";
  providerActiveId: string; // "ollama" | openAiCompatible config id — meaningful when kind === "builtin"
  acpActiveId: string | null; // meaningful when kind === "acp"
  model: string; // Ollama model name, or free-text OpenAI-compatible model id
  acpModel: string | null; // last explicitly chosen model for the active ACP agent, if any
}

function loadConversationBackend(): Record<
  string,
  ConversationBackendSelection
> {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(CONVERSATION_BACKEND_KEY) ?? "{}",
    );
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // fall through
  }
  return {};
}

function saveConversationBackendMap(
  map: Record<string, ConversationBackendSelection>,
) {
  localStorage.setItem(CONVERSATION_BACKEND_KEY, JSON.stringify(map));
}

export interface AcpSlice {
  agentBackend: AgentBackendSettings;
  // Per-ACP-agent model list, keyed by `AcpAgentConfig.id`, populated by
  // briefly spawning and discarding a real connection to that agent (see
  // `fetchAcpModelsFor`) — an entry missing from this map means "not
  // fetched yet"; `null` means "fetched, agent has no model option or
  // failed to connect". Lets `ChatPanel`'s picker show per-model rows for
  // an ACP agent before the user has ever actually chatted with it.
  acpModelCache: Record<string, AcpModelOptions | null>;
  // Per-conversation backend/model choice, keyed by session id — see
  // `ConversationBackendSelection`'s doc comment.
  conversationBackend: Record<string, ConversationBackendSelection>;
  setAgentBackendKind: (kind: "builtin" | "acp") => void;
  saveAcpAgentConfig: (config: AcpAgentConfig) => void;
  deleteAcpAgentConfig: (id: string) => void;
  setActiveAcpAgent: (id: string) => void;
  fetchAcpModelsFor: (agentId: string) => Promise<void>;
  refreshAcpModelCache: () => Promise<void>;
  setConversationBackend: (
    sessionId: string,
    selection: ConversationBackendSelection,
  ) => void;
}

export const acpSlice: StateCreator<AppStore, [], [], AcpSlice> = (
  set,
  get,
) => ({
  agentBackend: loadAgentBackend(),
  acpModelCache: {},
  conversationBackend: loadConversationBackend(),

  setAgentBackendKind: (kind) =>
    set((s) => {
      const agentBackend = { ...s.agentBackend, kind };
      saveAgentBackend(agentBackend);
      return { agentBackend };
    }),

  saveAcpAgentConfig: (config) => {
    let commandChanged = true;
    set((s) => {
      const existing = s.agentBackend.acpAgents.find((c) => c.id === config.id);
      commandChanged =
        !existing || existing.launchCommand !== config.launchCommand;
      const acpAgents = existing
        ? s.agentBackend.acpAgents.map((c) => (c.id === config.id ? config : c))
        : [...s.agentBackend.acpAgents, config];
      // Saving the first-ever ACP agent (or re-saving the active one) also
      // makes it active, so a freshly added config is immediately usable
      // without a second click — mirrors picking a preset.
      const activeAcpId = s.agentBackend.activeAcpId ?? config.id;
      const agentBackend = { ...s.agentBackend, acpAgents, activeAcpId };
      saveAgentBackend(agentBackend);
      // A changed launch command invalidates any cached model list fetched
      // for the old one — drop it so `fetchAcpModelsFor` below re-fetches
      // instead of trusting stale data.
      if (!commandChanged) return { agentBackend };
      const acpModelCache = Object.fromEntries(
        Object.entries(s.acpModelCache).filter(([id]) => id !== config.id),
      );
      return { agentBackend, acpModelCache };
    });
    if (commandChanged) get().fetchAcpModelsFor(config.id);
  },

  deleteAcpAgentConfig: (id) =>
    set((s) => {
      const acpAgents = s.agentBackend.acpAgents.filter((c) => c.id !== id);
      const activeAcpId =
        s.agentBackend.activeAcpId === id
          ? (acpAgents[0]?.id ?? null)
          : s.agentBackend.activeAcpId;
      const agentBackend = { ...s.agentBackend, acpAgents, activeAcpId };
      saveAgentBackend(agentBackend);
      const acpModelCache = Object.fromEntries(
        Object.entries(s.acpModelCache).filter(([cachedId]) => cachedId !== id),
      );
      return { agentBackend, acpModelCache };
    }),

  setActiveAcpAgent: (activeAcpId) =>
    set((s) => {
      const agentBackend = { ...s.agentBackend, activeAcpId };
      saveAgentBackend(agentBackend);
      return { agentBackend };
    }),

  fetchAcpModelsFor: async (agentId) => {
    if (agentId in get().acpModelCache || acpModelFetchesInFlight.has(agentId))
      return;
    const agent = get().agentBackend.acpAgents.find((c) => c.id === agentId);
    if (!agent) return;
    acpModelFetchesInFlight.add(agentId);
    try {
      const options = await api.fetchAcpModels(agent.launchCommand);
      set((s) => ({
        acpModelCache: { ...s.acpModelCache, [agentId]: options },
      }));
    } catch {
      // Agent failed to launch/connect for discovery — cache the miss too,
      // so a broken command doesn't get retried on every popover open.
      set((s) => ({ acpModelCache: { ...s.acpModelCache, [agentId]: null } }));
    } finally {
      acpModelFetchesInFlight.delete(agentId);
    }
  },

  refreshAcpModelCache: async () => {
    await Promise.all(
      get().agentBackend.acpAgents.map((c) => get().fetchAcpModelsFor(c.id)),
    );
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
});
