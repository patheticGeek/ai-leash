import { create } from "zustand";
import { api, type ModelSummary, type ProviderConfigPayload } from "./lib/tauriApi";
import type { Entry } from "./lib/chatEntries";

const RECENT_PROJECTS_KEY = "ai-leash:recentProjects";
const PROVIDER_CONFIG_KEY = "ai-leash:providerConfig";

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

export interface SubAgentTask {
  subSessionId: string;
  parentSessionId: string;
  description: string;
  status: "running" | "done" | "error";
  startedAt: number;
}

// The Sub Agents sidebar list is a cross-project history now (see
// `openProject`), not cleared on every switch — capped by age instead, so
// a long-running app doesn't accumulate it forever.
export const SUB_AGENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function dropExpiredSubAgentTasks(tasks: SubAgentTask[]): SubAgentTask[] {
  const cutoff = Date.now() - SUB_AGENT_MAX_AGE_MS;
  return tasks.filter((t) => t.startedAt >= cutoff);
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
  ollamaConnected: boolean | null;
  ollamaModels: ModelSummary[];
  providerSettings: ProviderSettings;
  settingsModalOpen: boolean;
  subAgentTasks: SubAgentTask[];
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
  openProject: (root: string) => Promise<void>;
  restoreLastProject: () => Promise<void>;
  openFile: (path: string, name: string) => Promise<void>;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveActive: () => Promise<void>;
  refreshOllama: () => Promise<void>;
  setOllamaConnected: (connected: boolean) => void;
  activeProviderConfig: () => ProviderConfigPayload;
  setSettingsModalOpen: (open: boolean) => void;
  setOllamaHost: (host: string) => void;
  saveOpenAiCompatibleConfig: (config: OpenAiCompatibleProviderConfig) => void;
  deleteOpenAiCompatibleConfig: (id: string) => void;
  setActiveProvider: (activeId: string) => void;
  startSubAgentTask: (task: {
    subSessionId: string;
    parentSessionId: string;
    description: string;
  }) => void;
  finishSubAgentTask: (subSessionId: string, status: "done" | "error") => void;
  pruneOldSubAgentTasks: () => void;
  openPanelTab: (kind: PanelTabKind, opts?: { path?: string; label?: string }) => void;
  closePanelTab: (id: string) => void;
  setActivePanelTab: (id: string) => void;
  openChatTab: (subSessionId: string, label: string) => void;
  closeChatTab: (id: string) => void;
  setActiveChatTab: (id: string) => void;
  setSubAgentEntries: (subSessionId: string, updater: (prev: Entry[]) => Entry[]) => void;
  setSessionGenerating: (sessionId: string, generating: boolean) => void;
  touchProjectActivity: (path: string) => void;
}

function panelTabIdFor(kind: PanelTabKind, path?: string): string {
  if (kind === "file") return `file:${path}`;
  if (kind === "terminal") return `terminal:${crypto.randomUUID()}`;
  return kind;
}

export const useAppStore = create<AppStore>((set, get) => ({
  projectRoot: null,
  openFiles: [],
  activePath: null,
  ollamaConnected: null,
  ollamaModels: [],
  providerSettings: loadProviderSettings(),
  settingsModalOpen: false,
  subAgentTasks: [],
  panelTabs: [],
  activePanelTabId: null,
  panelStateByConversation: {},
  chatTabs: [PRIMARY_CHAT_TAB],
  activeChatTabId: "primary",
  subAgentThreads: {},
  recentProjects: loadRecentProjects(),
  generatingSessions: {},

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
        // reset here anymore — they're a cross-project history capped by
        // age (see `SUB_AGENT_MAX_AGE_MS`), not per-conversation state.
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
      const models = await api.listProviderModels(get().activeProviderConfig());
      set({ ollamaModels: models, ollamaConnected: true });
    } catch {
      set({ ollamaModels: [], ollamaConnected: false });
    }
  },

  setOllamaConnected: (connected) => set({ ollamaConnected: connected }),

  // Narrows `providerSettings` (which carries frontend-only bookkeeping like
  // `id`/`label`/`model`) down to exactly the shape the backend's
  // `ProviderConfig` enum expects, so callers can pass this straight into
  // `api.listProviderModels`/`api.sendPrompt`/`api.retryLast`.
  activeProviderConfig: () => {
    const { providerSettings } = get();
    if (providerSettings.activeId === "ollama") {
      return { kind: "ollama", host: providerSettings.ollama.host };
    }
    const found = providerSettings.openAiCompatible.find(
      (c) => c.id === providerSettings.activeId,
    );
    if (!found) return { kind: "ollama", host: providerSettings.ollama.host };
    return { kind: "openAiCompatible", baseUrl: found.baseUrl, apiKey: found.apiKey };
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

  startSubAgentTask: ({ subSessionId, parentSessionId, description }) =>
    set((s) => ({
      subAgentTasks: [
        ...dropExpiredSubAgentTasks(s.subAgentTasks),
        { subSessionId, parentSessionId, description, status: "running", startedAt: Date.now() },
      ],
    })),

  // Called on an interval by `SubAgentsTab` (the only thing rendering this
  // list) so entries also age out of view when it's just sitting open with
  // nothing new happening, not only when the next sub-agent starts.
  pruneOldSubAgentTasks: () =>
    set((s) => {
      const subAgentTasks = dropExpiredSubAgentTasks(s.subAgentTasks);
      return subAgentTasks.length === s.subAgentTasks.length ? s : { subAgentTasks };
    }),

  finishSubAgentTask: (subSessionId, status) =>
    set((s) => ({
      subAgentTasks: s.subAgentTasks.map((t) =>
        t.subSessionId === subSessionId ? { ...t, status } : t,
      ),
    })),

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

  setSessionGenerating: (sessionId, generating) =>
    set((s) => {
      const already = !!s.generatingSessions[sessionId];
      if (generating === already) return s;
      const next = { ...s.generatingSessions };
      if (generating) {
        next[sessionId] = true;
      } else {
        delete next[sessionId];
      }
      return { generatingSessions: next };
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
