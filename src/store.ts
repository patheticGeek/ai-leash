import { create } from "zustand";
import { api, type ModelSummary } from "./lib/tauriApi";

const LAST_PROJECT_KEY = "ai-leash:lastProjectRoot";

interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

interface AppStore {
  projectRoot: string | null;
  openFiles: OpenFile[];
  activePath: string | null;
  ollamaConnected: boolean | null;
  ollamaModels: ModelSummary[];
  openProject: (root: string) => Promise<void>;
  restoreLastProject: () => Promise<void>;
  openFile: (path: string, name: string) => Promise<void>;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveActive: () => Promise<void>;
  closeFile: (path: string) => void;
  refreshOllama: () => Promise<void>;
  setOllamaConnected: (connected: boolean) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  projectRoot: null,
  openFiles: [],
  activePath: null,
  ollamaConnected: null,
  ollamaModels: [],

  openProject: async (root) => {
    await api.setProjectRoot(root);
    localStorage.setItem(LAST_PROJECT_KEY, root);
    set({ projectRoot: root, openFiles: [], activePath: null });
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
    if (get().openFiles.some((f) => f.path === path)) {
      set({ activePath: path });
      return;
    }
    const content = await api.readFileText(path);
    set((s) => ({
      openFiles: [...s.openFiles, { path, name, content, dirty: false }],
      activePath: path,
    }));
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

  closeFile: (path) =>
    set((s) => {
      const openFiles = s.openFiles.filter((f) => f.path !== path);
      const activePath =
        s.activePath === path
          ? (openFiles[openFiles.length - 1]?.path ?? null)
          : s.activePath;
      return { openFiles, activePath };
    }),

  refreshOllama: async () => {
    try {
      const models = await api.listOllamaModels();
      set({ ollamaModels: models, ollamaConnected: true });
    } catch {
      set({ ollamaModels: [], ollamaConnected: false });
    }
  },

  setOllamaConnected: (connected) => set({ ollamaConnected: connected }),
}));
