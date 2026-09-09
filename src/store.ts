import { create } from "zustand";
import {
  api,
  type AcpModelOptions,
  type ModelSummary,
  type PermissionRequestPayload,
  type ProviderConfigPayload,
} from "./lib/tauriApi";
import type { Entry } from "./lib/chatEntries";

const RECENT_PROJECTS_KEY = "ai-leash:recentProjects";
const PROVIDER_CONFIG_KEY = "ai-leash:providerConfig";
const AGENT_BACKEND_KEY = "ai-leash:agentBackend";

interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

export interface RecentProject {
  path: string;
  name: string;
  // Epoch ms of the last chat turn started in this project (see
  // `touchProjectActivity`) — 0 means never. Display order is sorted by
  // this, not by when the project was last merely opened/switched to, so
  // clicking around the sidebar to look at things doesn't reorder it.
  lastMessageAt: number;
}

function loadRecentProjects(): RecentProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) ?? "[]");
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((p) => ({ ...p, lastMessageAt: p.lastMessageAt ?? 0 }));
    }
  } catch {
    // fall through to migration below
  }
  // One-time migration from the old single-project key (pre-multi-project sidebar).
  const legacy = localStorage.getItem("ai-leash:lastProjectRoot");
  if (!legacy) return [];
  const migrated = [
    { path: legacy, name: legacy.split("/").filter(Boolean).pop() ?? legacy, lastMessageAt: 0 },
  ];
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(migrated));
  localStorage.removeItem("ai-leash:lastProjectRoot");
  return migrated;
}

function saveRecentProjects(projects: RecentProject[]) {
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects));
}

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

export type ProviderConfig = OllamaProviderConfig | OpenAiCompatibleProviderConfig;

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
    const parsed = JSON.parse(localStorage.getItem(PROVIDER_CONFIG_KEY) ?? "null");
    if (parsed && typeof parsed === "object") {
      return {
        ollama: { kind: "ollama", host: parsed.ollama?.host ?? "localhost:11434" },
        openAiCompatible: Array.isArray(parsed.openAiCompatible) ? parsed.openAiCompatible : [],
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
function toProviderConfigPayload(config: ProviderConfig): ProviderConfigPayload {
  if (config.kind === "ollama") {
    return { kind: "ollama", host: config.host };
  }
  return { kind: "openAiCompatible", baseUrl: config.baseUrl, apiKey: config.apiKey };
}

// One global agent backend setting (not per-project), same reasoning as
// `providerSettings` — a session's chat "just uses whatever's active".
// External ACP support replaces the entire built-in agent loop for a
// session rather than varying which HTTP API a turn's model call goes to
// (that's what `ProviderConfig` above is for) — see docs/features/agent-chat.md.
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
  { id: "acp-preset-github-copilot", label: "GitHub Copilot", launchCommand: "copilot --acp" },
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
    const parsed = JSON.parse(localStorage.getItem(AGENT_BACKEND_KEY) ?? "null");
    if (parsed && typeof parsed === "object") {
      // Pre-multi-agent shape was `{kind: "acp", launchCommand}` — migrate
      // it into a single saved entry (seeding the presets alongside it too,
      // as a one-time thing) so existing users don't lose their setup.
      if (parsed.kind === "acp" && typeof parsed.launchCommand === "string" && !Array.isArray(parsed.acpAgents)) {
        const id = crypto.randomUUID();
        return {
          kind: "acp",
          acpAgents: withDefaultAcpAgents([{ id, label: "ACP agent", launchCommand: parsed.launchCommand }]),
          activeAcpId: id,
        };
      }
      if (parsed.kind === "acp" || parsed.kind === "builtin") {
        // Once a real `acpAgents` array has been saved, it's authoritative
        // as-is — no re-seeding here, or deleting a default preset would
        // silently bring it back on the next reload.
        return {
          kind: parsed.kind,
          acpAgents: Array.isArray(parsed.acpAgents) ? parsed.acpAgents : withDefaultAcpAgents([]),
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

function loadConversationBackend(): Record<string, ConversationBackendSelection> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONVERSATION_BACKEND_KEY) ?? "{}");
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // fall through
  }
  return {};
}

function saveConversationBackendMap(map: Record<string, ConversationBackendSelection>) {
  localStorage.setItem(CONVERSATION_BACKEND_KEY, JSON.stringify(map));
}

export interface SubAgentTask {
  subSessionId: string;
  parentSessionId: string;
  description: string;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt?: number;
}

export type PanelTabKind = "filetree" | "subagents" | "terminal" | "file";

export interface PanelTab {
  id: string;
  kind: PanelTabKind;
  path?: string;
  label: string;
}

interface ConversationPanelState {
  panelTabs: PanelTab[];
  activePanelTabId: string | null;
}

export type ChatTabKind = "primary" | "subagent";

export interface ChatTab {
  id: string;
  kind: ChatTabKind;
  subSessionId?: string;
  label: string;
}

const PRIMARY_CHAT_TAB: ChatTab = { id: "primary", kind: "primary", label: "Agent" };

interface AppStore {
  projectRoot: string | null;
  openFiles: OpenFile[];
  activePath: string | null;
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
  settingsModalOpen: boolean;
  subAgentTasks: SubAgentTask[];
  // Bumped every time `clearSubAgentTasksForParent` runs. Lets an in-flight
  // `loadSubAgentTasks()` fetch (started before the clear) detect that its
  // result is now stale and must not merge stale rows back in — see
  // `loadSubAgentTasks`.
  subAgentTasksEpoch: number;
  panelTabs: PanelTab[];
  activePanelTabId: string | null;
  panelStateByConversation: Record<string, ConversationPanelState>;
  chatTabs: ChatTab[];
  activeChatTabId: string;
  subAgentThreads: Record<string, Entry[]>;
  recentProjects: RecentProject[];
  // Which sessions (by session id — a project's own path, for a top-level
  // conversation) currently have a turn in flight, driven entirely by the
  // backend's `chat://{sessionId}/generating` event rather than any
  // frontend action — see `LeftBar.tsx`, the always-mounted subscriber.
  generatingSessions: Record<string, boolean>;
  // Which of those active sessions are running an *autonomous* turn right
  // now — the model reacting to a finished background sub-agent, not
  // anything the user just sent. `ChatPanel.tsx` uses this to avoid
  // showing the Stop button / blocking new sends for a turn the user isn't
  // actually waiting on; `LeftBar.tsx`'s busy dot ignores it (any activity
  // still lights it up).
  autonomousGeneratingSessions: Record<string, boolean>;
  // Keyed by the *exact* session id the request came from — for a sub-agent
  // that's its own synthetic `{parentSessionId}::spawn_sub_agent::{uuid}`
  // id, not its parent's. `permissionForSession` (below) is what resolves
  // "does this project have anything pending", checking both an exact match
  // and any child sub-agent id, since a sub-agent's tool calls have nowhere
  // of their own to surface a popover — they're shown above the *parent*
  // project's textarea instead. One global `permission://request`/
  // `permission://resolved` listener pair maintains this (see
  // `LeftBar.tsx`) — unlike `generatingSessions`, no per-project listener
  // is needed since the backend event itself now carries `sessionId`.
  pendingPermissions: Record<string, PermissionRequestPayload>;
  addPendingPermission: (payload: PermissionRequestPayload) => void;
  resolvePendingPermission: (id: string) => void;
  openProject: (root: string) => Promise<void>;
  restoreLastProject: () => Promise<void>;
  openFile: (path: string, name: string) => Promise<void>;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveActive: () => Promise<void>;
  refreshOllama: () => Promise<void>;
  refreshProviderConnectivity: () => Promise<void>;
  providerConfigFor: (activeId: string) => ProviderConfigPayload;
  setSettingsModalOpen: (open: boolean) => void;
  setOllamaHost: (host: string) => void;
  saveOpenAiCompatibleConfig: (config: OpenAiCompatibleProviderConfig) => void;
  deleteOpenAiCompatibleConfig: (id: string) => void;
  setActiveProvider: (activeId: string) => void;
  setAgentBackendKind: (kind: "builtin" | "acp") => void;
  saveAcpAgentConfig: (config: AcpAgentConfig) => void;
  deleteAcpAgentConfig: (id: string) => void;
  setActiveAcpAgent: (id: string) => void;
  fetchAcpModelsFor: (agentId: string) => Promise<void>;
  refreshAcpModelCache: () => Promise<void>;
  setConversationBackend: (sessionId: string, selection: ConversationBackendSelection) => void;
  startSubAgentTask: (task: {
    subSessionId: string;
    parentSessionId: string;
    description: string;
  }) => void;
  finishSubAgentTask: (subSessionId: string, status: "done" | "error") => void;
  // Drops every sub-agent spawned by `parentSessionId` from local state —
  // called alongside `/clear` (`ChatPanel.tsx`), since `chat::
  // clear_conversation` now deletes their rows on the backend too
  // (`db::clear_conversation`) rather than leaving them as orphaned rows a
  // cleared conversation can no longer reach. Also closes any of their open
  // `chatTabs` (a stale tab pointing at a just-deleted transcript would
  // 404 the next time `load_conversation_history` runs for it) and drops
  // their live `subAgentThreads`.
  clearSubAgentTasksForParent: (parentSessionId: string) => void;
  // Removes a single finished sub-agent (Sub Agents tab's delete button —
  // see `SubAgentsTab.tsx`), both on the backend (`db::delete_sub_agent`)
  // and from local state/tabs, the same bookkeeping
  // `clearSubAgentTasksForParent` does for a whole parent's worth at once.
  deleteSubAgentTask: (subSessionId: string) => Promise<void>;
  // Backend is the source of truth (SQLite, kept indefinitely) — this merges
  // in anything not already known locally, without clobbering live updates
  // a `subtask_start`/`done`/`error` event may have already applied. Safe
  // to call repeatedly (e.g. on every mount of `SubAgentsTab`/`App`). Discards
  // its result if `clearSubAgentTasksForParent` ran while the fetch was in
  // flight, so a stale read can't resurrect rows a `/clear` just removed.
  loadSubAgentTasks: () => Promise<void>;
  openPanelTab: (kind: PanelTabKind, opts?: { path?: string; label?: string }) => void;
  closePanelTab: (id: string) => void;
  setActivePanelTab: (id: string) => void;
  openChatTab: (subSessionId: string, label: string) => void;
  closeChatTab: (id: string) => void;
  setActiveChatTab: (id: string) => void;
  setSubAgentEntries: (subSessionId: string, updater: (prev: Entry[]) => Entry[]) => void;
  setSessionGenerating: (sessionId: string, generating: boolean, autonomous: boolean) => void;
  touchProjectActivity: (path: string) => void;
}

function panelTabIdFor(kind: PanelTabKind, path?: string): string {
  if (kind === "file") return `file:${path}`;
  if (kind === "terminal") return `terminal:${crypto.randomUUID()}`;
  return kind;
}

// Resolves "does this project have a permission request waiting" — an
// exact match (a top-level conversation's own tool call), or a sub-agent
// spawned from it (`{sessionId}::spawn_sub_agent::{uuid}`, see
// `spawn_sub_agent` in tools.rs), since a sub-agent has no textarea of its
// own to show a popover above. Used by both `ChatPanel.tsx` (to render the
// popover) and `LeftBar.tsx` (to glow the row) so the two never disagree
// about which project a given request belongs to.
export function permissionForSession(
  pending: Record<string, PermissionRequestPayload>,
  sessionId: string,
): PermissionRequestPayload | null {
  if (pending[sessionId]) return pending[sessionId];
  const childPrefix = `${sessionId}::spawn_sub_agent::`;
  return Object.values(pending).find((p) => p.sessionId.startsWith(childPrefix)) ?? null;
}

export const useAppStore = create<AppStore>((set, get) => ({
  projectRoot: null,
  openFiles: [],
  activePath: null,
  ollamaModels: [],
  providerSettings: loadProviderSettings(),
  providerConnectivity: {},
  agentBackend: loadAgentBackend(),
  acpModelCache: {},
  conversationBackend: loadConversationBackend(),
  settingsModalOpen: false,
  subAgentTasks: [],
  subAgentTasksEpoch: 0,
  panelTabs: [],
  activePanelTabId: null,
  panelStateByConversation: {},
  chatTabs: [PRIMARY_CHAT_TAB],
  activeChatTabId: "primary",
  subAgentThreads: {},
  recentProjects: loadRecentProjects(),
  generatingSessions: {},
  autonomousGeneratingSessions: {},
  pendingPermissions: {},

  // `root` doubles as the conversation id for now — one conversation per
  // project, until multiple named conversations per project are wired up.
  openProject: async (root) => {
    await api.setProjectRoot(root);
    const name = root.split("/").filter(Boolean).pop() ?? root;
    const prevRoot = get().projectRoot;
    const prevPanelTabs = get().panelTabs;
    const prevActivePanelTabId = get().activePanelTabId;

    const restored = get().panelStateByConversation[root];
    const restoredActiveTab = restored?.panelTabs.find(
      (t) => t.id === restored.activePanelTabId,
    );

    set((s) => {
      const panelStateByConversation = { ...s.panelStateByConversation };
      if (prevRoot) {
        panelStateByConversation[prevRoot] = {
          panelTabs: prevPanelTabs,
          activePanelTabId: prevActivePanelTabId,
        };
      }
      // Merely opening/switching to a project doesn't reorder the list —
      // only `touchProjectActivity` (a chat turn actually starting) does,
      // so browsing the sidebar doesn't shuffle it under you. A brand new
      // project is appended as-is; a known one is left untouched.
      const recentProjects = s.recentProjects.some((p) => p.path === root)
        ? s.recentProjects
        : [...s.recentProjects, { path: root, name, lastMessageAt: 0 }];
      saveRecentProjects(recentProjects);
      return {
        projectRoot: root,
        openFiles: [],
        activePath: restoredActiveTab?.kind === "file" ? (restoredActiveTab.path ?? null) : null,
        panelTabs: restored?.panelTabs ?? [],
        activePanelTabId: restored?.activePanelTabId ?? null,
        panelStateByConversation,
        recentProjects,
        // The center pane's open tabs are specific to whichever project's
        // conversation is currently in view — a stale sub-agent tab from a
        // different project showing up here would be the wrong context, so
        // this still resets. `subAgentTasks`/`subAgentThreads` (the Sub
        // Agents sidebar list and its transcripts) deliberately do NOT
        // reset here anymore — they're a cross-project history stored
        // indefinitely in SQLite (see `loadSubAgentTasks`), not
        // per-conversation state.
        chatTabs: [PRIMARY_CHAT_TAB],
        activeChatTabId: "primary",
      };
    });

    // Restored file tabs need their content re-read from disk (fresh, not
    // carried over — the old content was dropped when this project's tabs
    // were snapshotted). A file that's since been deleted just loses its tab.
    const fileTabs = (restored?.panelTabs ?? []).filter(
      (t): t is PanelTab & { path: string } => t.kind === "file" && !!t.path,
    );
    for (const tab of fileTabs) {
      try {
        const content = await api.readFileText(tab.path);
        set((s) => ({
          openFiles: s.openFiles.some((f) => f.path === tab.path)
            ? s.openFiles
            : [...s.openFiles, { path: tab.path, name: tab.label, content, dirty: false }],
        }));
      } catch {
        get().closePanelTab(tab.id);
      }
    }
  },

  restoreLastProject: async () => {
    const projects = get().recentProjects;
    if (projects.length === 0) return;
    const last = projects.reduce((a, b) => (b.lastMessageAt > a.lastMessageAt ? b : a));
    try {
      await get().openProject(last.path);
    } catch {
      set((s) => {
        const recentProjects = s.recentProjects.filter((p) => p.path !== last.path);
        saveRecentProjects(recentProjects);
        return { recentProjects };
      });
    }
  },

  openFile: async (path, name) => {
    if (!get().openFiles.some((f) => f.path === path)) {
      const content = await api.readFileText(path);
      set((s) => ({
        openFiles: [...s.openFiles, { path, name, content, dirty: false }],
      }));
    }
    get().openPanelTab("file", { path, label: name });
  },

  setActive: (path) => set({ activePath: path }),

  updateContent: (path, content) =>
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, content, dirty: true } : f,
      ),
    })),

  saveActive: async () => {
    const { activePath, openFiles } = get();
    const file = openFiles.find((f) => f.path === activePath);
    if (!file) return;
    await api.writeFileText(file.path, file.content);
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === file.path ? { ...f, dirty: false } : f,
      ),
    }));
  },

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
    const found = providerSettings.openAiCompatible.find((c) => c.id === activeId);
    return toProviderConfigPayload(found ?? providerSettings.ollama);
  },

  // Checks reachability of every configured provider (not just the active
  // one — see `providerConnectivity`'s doc comment), for the status bar's
  // aggregate indicator.
  refreshProviderConnectivity: async () => {
    const { providerSettings } = get();
    const targets: [string, ProviderConfig][] = [
      ["ollama", providerSettings.ollama],
      ...providerSettings.openAiCompatible.map((c): [string, ProviderConfig] => [c.id, c]),
    ];
    const results = await Promise.all(
      targets.map(async ([id, config]) => {
        try {
          const connected = await api.checkProviderConnection(toProviderConfigPayload(config));
          return [id, connected] as const;
        } catch {
          return [id, false] as const;
        }
      }),
    );
    set((s) => ({
      providerConnectivity: { ...s.providerConnectivity, ...Object.fromEntries(results) },
    }));
  },

  setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),

  setOllamaHost: (host) =>
    set((s) => {
      const providerSettings = { ...s.providerSettings, ollama: { kind: "ollama" as const, host } };
      saveProviderSettings(providerSettings);
      return { providerSettings };
    }),

  saveOpenAiCompatibleConfig: (config) =>
    set((s) => {
      const exists = s.providerSettings.openAiCompatible.some((c) => c.id === config.id);
      const openAiCompatible = exists
        ? s.providerSettings.openAiCompatible.map((c) => (c.id === config.id ? config : c))
        : [...s.providerSettings.openAiCompatible, config];
      const providerSettings = { ...s.providerSettings, openAiCompatible };
      saveProviderSettings(providerSettings);
      return { providerSettings };
    }),

  deleteOpenAiCompatibleConfig: (id) =>
    set((s) => {
      const openAiCompatible = s.providerSettings.openAiCompatible.filter((c) => c.id !== id);
      const activeId = s.providerSettings.activeId === id ? "ollama" : s.providerSettings.activeId;
      const providerSettings = { ...s.providerSettings, openAiCompatible, activeId };
      saveProviderSettings(providerSettings);
      return { providerSettings };
    }),

  setActiveProvider: (activeId) =>
    set((s) => {
      const providerSettings = { ...s.providerSettings, activeId };
      saveProviderSettings(providerSettings);
      return { providerSettings };
    }),

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
      commandChanged = !existing || existing.launchCommand !== config.launchCommand;
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
        s.agentBackend.activeAcpId === id ? (acpAgents[0]?.id ?? null) : s.agentBackend.activeAcpId;
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
    if (agentId in get().acpModelCache || acpModelFetchesInFlight.has(agentId)) return;
    const agent = get().agentBackend.acpAgents.find((c) => c.id === agentId);
    if (!agent) return;
    acpModelFetchesInFlight.add(agentId);
    try {
      const options = await api.fetchAcpModels(agent.launchCommand);
      set((s) => ({ acpModelCache: { ...s.acpModelCache, [agentId]: options } }));
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
      const conversationBackend = { ...s.conversationBackend, [sessionId]: selection };
      saveConversationBackendMap(conversationBackend);
      return { conversationBackend };
    }),

  startSubAgentTask: ({ subSessionId, parentSessionId, description }) =>
    set((s) => ({
      subAgentTasks: [
        ...s.subAgentTasks,
        { subSessionId, parentSessionId, description, status: "running", startedAt: Date.now() },
      ],
    })),

  loadSubAgentTasks: async () => {
    const epochAtStart = get().subAgentTasksEpoch;
    const rows = await api.listSubAgents();
    set((s) => {
      // A `/clear` ran while this fetch was in flight — `rows` reflects a
      // pre-clear snapshot, so merging it back in would resurrect entries
      // `clearSubAgentTasksForParent` just removed. Drop it.
      if (s.subAgentTasksEpoch !== epochAtStart) return s;
      const known = new Set(s.subAgentTasks.map((t) => t.subSessionId));
      const fromDb: SubAgentTask[] = rows
        .filter((r) => !known.has(r.id))
        .map((r) => ({
          subSessionId: r.id,
          parentSessionId: r.parentSessionId,
          description: r.description,
          status: r.status,
          startedAt: r.startedAt * 1000,
          endedAt: r.finishedAt ? r.finishedAt * 1000 : undefined,
        }));
      return fromDb.length ? { subAgentTasks: [...s.subAgentTasks, ...fromDb] } : s;
    });
  },

  finishSubAgentTask: (subSessionId, status) =>
    set((s) => ({
      subAgentTasks: s.subAgentTasks.map((t) =>
        t.subSessionId === subSessionId ? { ...t, status, endedAt: Date.now() } : t,
      ),
    })),

  clearSubAgentTasksForParent: (parentSessionId) =>
    set((s) => {
      const removedIds = new Set(
        s.subAgentTasks
          .filter((t) => t.parentSessionId === parentSessionId)
          .map((t) => t.subSessionId),
      );
      // Always bump the epoch, even with nothing locally known to remove yet:
      // an initial `loadSubAgentTasks()` fetch may still be in flight and
      // would otherwise merge in this parent's now-deleted rows once it
      // resolves (see `loadSubAgentTasks`).
      if (removedIds.size === 0) return { subAgentTasksEpoch: s.subAgentTasksEpoch + 1 };

      const subAgentTasks = s.subAgentTasks.filter((t) => !removedIds.has(t.subSessionId));
      const subAgentThreads = Object.fromEntries(
        Object.entries(s.subAgentThreads).filter(([id]) => !removedIds.has(id)),
      );
      const chatTabs = s.chatTabs.filter(
        (t) => !t.subSessionId || !removedIds.has(t.subSessionId),
      );
      const activeChatTabId = chatTabs.some((t) => t.id === s.activeChatTabId)
        ? s.activeChatTabId
        : "primary";
      return {
        subAgentTasks,
        subAgentThreads,
        chatTabs,
        activeChatTabId,
        subAgentTasksEpoch: s.subAgentTasksEpoch + 1,
      };
    }),

  deleteSubAgentTask: async (subSessionId) => {
    await api.deleteSubAgent(subSessionId);
    set((s) => {
      const chatTabs = s.chatTabs.filter((t) => t.subSessionId !== subSessionId);
      const activeChatTabId = chatTabs.some((t) => t.id === s.activeChatTabId)
        ? s.activeChatTabId
        : "primary";
      const subAgentThreads = { ...s.subAgentThreads };
      delete subAgentThreads[subSessionId];
      return {
        subAgentTasks: s.subAgentTasks.filter((t) => t.subSessionId !== subSessionId),
        subAgentThreads,
        chatTabs,
        activeChatTabId,
        // Guards against a `loadSubAgentTasks()` fetch that was already in
        // flight from re-adding this id once it resolves with stale data —
        // same reasoning as `clearSubAgentTasksForParent`.
        subAgentTasksEpoch: s.subAgentTasksEpoch + 1,
      };
    });
  },

  openPanelTab: (kind, opts) => {
    const id = kind === "file" ? panelTabIdFor(kind, opts?.path) : panelTabIdFor(kind);
    const existing = get().panelTabs.find((t) => t.id === id);
    if (existing) {
      set({ activePanelTabId: id, activePath: existing.kind === "file" ? existing.path! : null });
      return;
    }
    const defaultLabels: Record<PanelTabKind, string> = {
      filetree: "Files",
      subagents: "Sub Agents",
      terminal: `Terminal ${get().panelTabs.filter((t) => t.kind === "terminal").length + 1}`,
      file: opts?.label ?? "file",
    };
    const tab: PanelTab = {
      id,
      kind,
      path: opts?.path,
      label: opts?.label ?? defaultLabels[kind],
    };
    set((s) => ({
      panelTabs: [...s.panelTabs, tab],
      activePanelTabId: id,
      activePath: kind === "file" ? (opts?.path ?? null) : null,
    }));
  },

  closePanelTab: (id) =>
    set((s) => {
      const idx = s.panelTabs.findIndex((t) => t.id === id);
      if (idx === -1) return s;
      const closed = s.panelTabs[idx];
      const panelTabs = s.panelTabs.filter((t) => t.id !== id);
      const openFiles =
        closed.kind === "file" ? s.openFiles.filter((f) => f.path !== closed.path) : s.openFiles;

      let activePanelTabId = s.activePanelTabId;
      let activePath = s.activePath;
      if (s.activePanelTabId === id) {
        const next = panelTabs[idx] ?? panelTabs[idx - 1] ?? null;
        activePanelTabId = next?.id ?? null;
        activePath = next?.kind === "file" ? (next.path ?? null) : null;
      }
      return { panelTabs, openFiles, activePanelTabId, activePath };
    }),

  setActivePanelTab: (id) =>
    set((s) => {
      const tab = s.panelTabs.find((t) => t.id === id);
      return {
        activePanelTabId: id,
        activePath: tab?.kind === "file" ? (tab.path ?? null) : null,
      };
    }),

  openChatTab: (subSessionId, label) => {
    const id = `subagent:${subSessionId}`;
    set((s) => {
      if (s.chatTabs.some((t) => t.id === id)) {
        return { activeChatTabId: id };
      }
      return {
        chatTabs: [...s.chatTabs, { id, kind: "subagent", subSessionId, label }],
        activeChatTabId: id,
      };
    });
  },

  closeChatTab: (id) =>
    set((s) => {
      if (id === "primary") return s;
      const chatTabs = s.chatTabs.filter((t) => t.id !== id);
      const activeChatTabId = s.activeChatTabId === id ? "primary" : s.activeChatTabId;
      return { chatTabs, activeChatTabId };
    }),

  setActiveChatTab: (id) => set({ activeChatTabId: id }),

  setSubAgentEntries: (subSessionId, updater) =>
    set((s) => ({
      subAgentThreads: {
        ...s.subAgentThreads,
        [subSessionId]: updater(s.subAgentThreads[subSessionId] ?? []),
      },
    })),

  setSessionGenerating: (sessionId, generating, autonomous) =>
    set((s) => {
      const already = !!s.generatingSessions[sessionId];
      const alreadyAutonomous = !!s.autonomousGeneratingSessions[sessionId];
      if (generating === already && autonomous === alreadyAutonomous) return s;

      const next = { ...s.generatingSessions };
      const nextAutonomous = { ...s.autonomousGeneratingSessions };
      if (generating) {
        next[sessionId] = true;
        if (autonomous) {
          nextAutonomous[sessionId] = true;
        } else {
          delete nextAutonomous[sessionId];
        }
      } else {
        delete next[sessionId];
        delete nextAutonomous[sessionId];
      }
      return { generatingSessions: next, autonomousGeneratingSessions: nextAutonomous };
    }),

  addPendingPermission: (payload) =>
    set((s) => ({ pendingPermissions: { ...s.pendingPermissions, [payload.sessionId]: payload } })),

  resolvePendingPermission: (id) =>
    set((s) => {
      const entry = Object.entries(s.pendingPermissions).find(([, p]) => p.id === id);
      if (!entry) return s;
      const pendingPermissions = { ...s.pendingPermissions };
      delete pendingPermissions[entry[0]];
      return { pendingPermissions };
    }),

  touchProjectActivity: (path) =>
    set((s) => {
      if (!s.recentProjects.some((p) => p.path === path)) return s;
      const recentProjects = s.recentProjects.map((p) =>
        p.path === path ? { ...p, lastMessageAt: Date.now() } : p,
      );
      saveRecentProjects(recentProjects);
      return { recentProjects };
    }),
}));
