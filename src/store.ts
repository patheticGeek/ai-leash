import { create } from "zustand";
import { api, type ModelSummary } from "./lib/tauriApi";

const LAST_PROJECT_KEY = "ai-leash:lastProjectRoot";

interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
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

interface AppStore {
  projectRoot: string | null;
  openFiles: OpenFile[];
  activePath: string | null;
  ollamaConnected: boolean | null;
  ollamaModels: ModelSummary[];
  subAgentTasks: SubAgentTask[];
  panelTabs: PanelTab[];
  activePanelTabId: string | null;
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

  openProject: async (root) => {
    await api.setProjectRoot(root);
    localStorage.setItem(LAST_PROJECT_KEY, root);
    set({
      projectRoot: root,
      openFiles: [],
      activePath: null,
      panelTabs: [],
      activePanelTabId: null,
    });
  },

  restoreLastProject: async () => {
    const last = localStorage.getItem(LAST_PROJECT_KEY);
    if (!last) return;
    try {
      await get().openProject(last);
    } catch {
      localStorage.removeItem(LAST_PROJECT_KEY);
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
}));
