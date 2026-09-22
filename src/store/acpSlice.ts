import type { StateCreator } from "zustand";
import { qk } from "../data/keys";
import { LS_KEYS } from "../lib/localStorageKeys";
import { queryClient } from "../lib/queryClient";
import {
  type AcpAgentCatalogEntry,
  type AcpAgentOptions,
  api,
} from "../lib/tauriApi";
import { isEnabled } from "./backendSlice";
import type { ConversationSummary } from "./conversationSlice";
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
  queryClient.setQueryData(qk.acpCatalog, merged);
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

// Wire shape of `ConversationSummary.backend` — a small JSON blob naming
// which provider/ACP agent, same discriminated shape as `DefaultBackendRef`
// in `backendSlice.ts` (that's a coincidence of both meaning "a backend
// reference", not a shared type — this one is per-conversation and
// round-trips through SQLite as opaque JSON, so it's kept local to this
// file's encode/decode pair).
type ConversationBackendRef =
  | { kind: "builtin"; providerId: string }
  | { kind: "acp"; acpId: string };

// `ConversationBackendSelection` keeps both `model` and `acpModel` (and
// `providerActiveId`/`acpActiveId`) at once so switching `kind` mid-session
// and back restores whichever the *other* kind last had — but the DB only
// has one `model`/`effort` slot per conversation, so only the *active*
// kind's half round-trips through a restart; the other resets to nothing
// next launch, same as a conversation that's never touched it.
function encodeConversationBackend(selection: ConversationBackendSelection): {
  backend: ConversationBackendRef;
  model: string | null;
  effort: string | null;
} | null {
  if (selection.kind === "acp") {
    if (!selection.acpActiveId) return null; // nothing chosen yet — nothing to persist
    return {
      backend: { kind: "acp", acpId: selection.acpActiveId },
      model: selection.acpModel,
      effort: selection.acpEffort,
    };
  }
  if (!selection.providerActiveId) return null;
  return {
    backend: { kind: "builtin", providerId: selection.providerActiveId },
    model: selection.model || null,
    effort: null,
  };
}

function decodeConversationBackend(row: {
  backend: string | null;
  model: string | null;
  effort: string | null;
}): ConversationBackendSelection | null {
  if (!row.backend) return null;
  let ref: ConversationBackendRef;
  try {
    ref = JSON.parse(row.backend);
  } catch {
    return null;
  }
  if (ref.kind === "acp" && ref.acpId) {
    return {
      kind: "acp",
      providerActiveId: "",
      acpActiveId: ref.acpId,
      model: "",
      acpModel: row.model,
      acpEffort: row.effort,
    };
  }
  if (ref.kind === "builtin" && ref.providerId) {
    return {
      kind: "builtin",
      providerActiveId: ref.providerId,
      acpActiveId: null,
      model: row.model ?? "",
      acpModel: null,
      acpEffort: null,
    };
  }
  return null;
}

// Old shape of the pre-DB `LS_KEYS.conversationBackend` blob — same fields
// as `ConversationBackendSelection` since that's exactly what used to be
// written there verbatim.
function legacyConversationBackendEntry(
  value: unknown,
): ConversationBackendSelection | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ConversationBackendSelection>;
  if (v.kind !== "builtin" && v.kind !== "acp") return null;
  return {
    kind: v.kind,
    providerActiveId: v.providerActiveId ?? "",
    acpActiveId: v.acpActiveId ?? null,
    model: v.model ?? "",
    acpModel: v.acpModel ?? null,
    acpEffort: v.acpEffort ?? null,
  };
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
  // `conversationSlice.deleteConversation`. Rust already drops the row's own
  // `backend`/`model`/`effort` columns as part of deleting the conversation
  // itself, so this only needs to clear the in-memory map.
  forgetConversationBackend: (sessionId: string) => void;
  // Seeds `conversationBackend` from freshly loaded rows — called once from
  // `conversationSlice.loadAllConversations`. For a row that already has a
  // `backend` column (the normal case after the first run), decodes it
  // straight in. Otherwise, the very first time this build runs against an
  // existing history DB, falls back to the old localStorage blob for that
  // id, pushes the decoded value to the DB (so it's there next launch) and,
  // once every row's been checked, removes the old key for good — a
  // one-shot migration with no separate "have I migrated yet" flag, since
  // after the first run the key is simply gone.
  hydrateConversationBackendFromRows: (rows: ConversationSummary[]) => void;
}

export const acpSlice: StateCreator<AppStore, [], [], AcpSlice> = (
  set,
  get,
) => ({
  agentBackend: loadAgentBackend(),
  // Seeded by `hydrateConversationBackendFromRows` once conversations load
  // (see `conversationSlice.loadAllConversations`) — empty until then, same
  // as `conversations` itself.
  conversationBackend: {},

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

  setConversationBackend: (sessionId, selection) => {
    set((s) => ({
      conversationBackend: { ...s.conversationBackend, [sessionId]: selection },
    }));
    const encoded = encodeConversationBackend(selection);
    if (!encoded) return;
    // The row this id already has (once listed) is authoritative for its
    // own `project_root`; a not-yet-listed brand-new conversation (this
    // conversation's first ever choice, made before its first message) has
    // no row yet, so this falls back to whichever project is currently
    // open — `save_message`'s own upsert corrects `project_root` for real
    // once this conversation actually sends anything, same tolerance
    // `set_conversation_worktree` already relies on.
    const projectRoot =
      get().conversations.find((c) => c.id === sessionId)?.projectRoot ??
      get().projectRoot;
    if (!projectRoot) return;
    void api.setConversationBackend(
      sessionId,
      projectRoot,
      JSON.stringify(encoded.backend),
      encoded.model,
      encoded.effort,
    );
  },

  forgetConversationBackend: (sessionId) =>
    set((s) => {
      if (!(sessionId in s.conversationBackend)) return s;
      const conversationBackend = { ...s.conversationBackend };
      delete conversationBackend[sessionId];
      return { conversationBackend };
    }),

  hydrateConversationBackendFromRows: (rows) => {
    const legacy = localStorageJson.read<Record<string, unknown>>(
      LS_KEYS.conversationBackend,
      {},
    );
    const hasLegacy =
      legacy && typeof legacy === "object" && Object.keys(legacy).length > 0;
    for (const row of rows) {
      if (get().conversationBackend[row.id]) continue;
      const decoded = decodeConversationBackend(row);
      if (decoded) {
        set((s) => ({
          conversationBackend: { ...s.conversationBackend, [row.id]: decoded },
        }));
        continue;
      }
      if (!hasLegacy) continue;
      const migrated = legacyConversationBackendEntry(legacy[row.id]);
      if (migrated) get().setConversationBackend(row.id, migrated);
    }
    if (hasLegacy) localStorage.removeItem(LS_KEYS.conversationBackend);
  },
});
