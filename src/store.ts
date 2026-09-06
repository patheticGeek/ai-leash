import { create } from "zustand";
import { api, type ModelSummary } from "./lib/tauriApi";
import type { Entry } from "./lib/chatEntries";

const RECENT_PROJECTS_KEY = "ai-leash:recentProjects";

interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

export interface RecentProject {
  path: string;
  name: string;
}

function loadRecentProjects(): RecentProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) ?? "[]");
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // fall through to migration below
  }
  // One-time migration from the old single-project key (pre-multi-project sidebar).
  const legacy = localStorage.getItem("ai-leash:lastProjectRoot");
  if (!legacy) return [];
  const migrated = [{ path: legacy, name: legacy.split("/").filter(Boolean).pop() ?? legacy }];
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(migrated));
  localStorage.removeItem("ai-leash:lastProjectRoot");
  return migrated;
}

function saveRecentProjects(projects: RecentProject[]) {
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects));
}

export interface SubAgentTask {
  subSessionId: string;
  parentSessionId: string;
  description: string;
  status: "running" | "done" | "error";
  startedAt: number;
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
  subAgentTasks: SubAgentTask[];
  panelTabs: PanelTab[];
  activePanelTabId: string | null;
  panelStateByConversation: Record<string, ConversationPanelState>;
  chatTabs: ChatTab[];
  activeChatTabId: string;
  subAgentThreads: Record<string, Entry[]>;
  recentProjects: RecentProject[];
  openProject: (root: string) => Promise<void>;
  restoreLastProject: () => Promise<void>;
  openFile: (path: string, name: string) => Promise<void>;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveActive: () => Promise<void>;
  refreshOllama: () => Promise<void>;
  setOllamaConnected: (connected: boolean) => void;
  startSubAgentTask: (task: {
    subSessionId: string;
    parentSessionId: string;
    description: string;
  }) => void;
  finishSubAgentTask: (subSessionId: string, status: "done" | "error") => void;
  openPanelTab: (kind: PanelTabKind, opts?: { path?: string; label?: string }) => void;
  closePanelTab: (id: string) => void;
  setActivePanelTab: (id: string) => void;
  openChatTab: (subSessionId: string, label: string) => void;
  closeChatTab: (id: string) => void;
  setActiveChatTab: (id: string) => void;
  setSubAgentEntries: (subSessionId: string, updater: (prev: Entry[]) => Entry[]) => void;
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
  subAgentTasks: [],
  panelTabs: [],
  activePanelTabId: null,
  panelStateByConversation: {},
  chatTabs: [PRIMARY_CHAT_TAB],
  activeChatTabId: "primary",
  subAgentThreads: {},
  recentProjects: loadRecentProjects(),

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
      const recentProjects = [
        { path: root, name },
        ...s.recentProjects.filter((p) => p.path !== root),
      ];
      saveRecentProjects(recentProjects);
      return {
        projectRoot: root,
        openFiles: [],
        activePath: restoredActiveTab?.kind === "file" ? (restoredActiveTab.path ?? null) : null,
        panelTabs: restored?.panelTabs ?? [],
        activePanelTabId: restored?.activePanelTabId ?? null,
        panelStateByConversation,
        recentProjects,
        // Sub-agents and their chat tabs belong to the conversation that
        // spawned them — a different project is a different conversation
        // (one conversation per project, for now), so none of this carries
        // over.
        chatTabs: [PRIMARY_CHAT_TAB],
        activeChatTabId: "primary",
        subAgentThreads: {},
        subAgentTasks: [],
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
    const last = get().recentProjects[0];
    if (!last) return;
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
      const models = await api.listOllamaModels();
      set({ ollamaModels: models, ollamaConnected: true });
    } catch {
      set({ ollamaModels: [], ollamaConnected: false });
    }
  },

  setOllamaConnected: (connected) => set({ ollamaConnected: connected }),

  startSubAgentTask: ({ subSessionId, parentSessionId, description }) =>
    set((s) => ({
      subAgentTasks: [
        ...s.subAgentTasks,
        { subSessionId, parentSessionId, description, status: "running", startedAt: Date.now() },
      ],
    })),

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
}));
