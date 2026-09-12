import type { StateCreator } from "zustand";
import { api } from "../lib/tauriApi";
import type { AppStore } from "./index";
import type { PanelTab } from "./panelSlice";
import { PRIMARY_CHAT_TAB } from "./panelSlice";

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
  title?: string | null;
  // Epoch ms of the last chat turn started in this project (see
  // `touchProjectActivity`) — 0 means never. Display order is sorted by
  // this, not by when the project was last merely opened/switched to, so
  // clicking around the sidebar to look at things doesn't reorder it.
  lastMessageAt: number;
}

function loadRecentProjects(): RecentProject[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(RECENT_PROJECTS_KEY) ?? "[]",
    );
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
    {
      path: legacy,
      name: legacy.split("/").filter(Boolean).pop() ?? legacy,
      lastMessageAt: 0,
    },
  ];
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(migrated));
  localStorage.removeItem("ai-leash:lastProjectRoot");
  return migrated;
}

function saveRecentProjects(projects: RecentProject[]) {
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects));
}

export interface ProjectSlice {
  projectRoot: string | null;
  openFiles: OpenFile[];
  activePath: string | null;
  recentProjects: RecentProject[];
  openProject: (root: string) => Promise<void>;
  removeProject: (root: string) => void;
  restoreLastProject: () => Promise<void>;
  openFile: (path: string, name: string) => Promise<void>;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveActive: () => Promise<void>;
  touchProjectActivity: (path: string) => void;
  setProjectTitle: (path: string, title: string | null) => void;
}

export const projectSlice: StateCreator<AppStore, [], [], ProjectSlice> = (
  set,
  get,
) => ({
  projectRoot: null,
  openFiles: [],
  activePath: null,
  recentProjects: loadRecentProjects(),

  // `root` doubles as the conversation id for now — one conversation per
  // project, until multiple named conversations per project are wired up.
  openProject: async (root) => {
    const title = await api.getConversationTitle(root);
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
        : [...s.recentProjects, { path: root, name, title, lastMessageAt: 0 }];
      const withTitle = recentProjects.map((project) =>
        project.path === root ? { ...project, title } : project,
      );
      saveRecentProjects(withTitle);
      return {
        projectRoot: root,
        openFiles: [],
        activePath:
          restoredActiveTab?.kind === "file"
            ? (restoredActiveTab.path ?? null)
            : null,
        panelTabs: restored?.panelTabs ?? [],
        activePanelTabId: restored?.activePanelTabId ?? null,
        panelStateByConversation,
        recentProjects: withTitle,
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
            : [
                ...s.openFiles,
                { path: tab.path, name: tab.label, content, dirty: false },
              ],
        }));
      } catch {
        get().closePanelTab(tab.id);
      }
    }
  },

  removeProject: (root) => {
    set((s) => {
      const recentProjects = s.recentProjects.filter((p) => p.path !== root);
      saveRecentProjects(recentProjects);
      if (s.projectRoot !== root) return { recentProjects };
      return {
        recentProjects,
        projectRoot: null,
        openFiles: [],
        activePath: null,
        panelTabs: [],
        activePanelTabId: null,
        chatTabs: [PRIMARY_CHAT_TAB],
        activeChatTabId: "primary",
      };
    });
  },

  restoreLastProject: async () => {
    const projects = get().recentProjects;
    if (projects.length === 0) return;
    const last = projects.reduce((a, b) =>
      b.lastMessageAt > a.lastMessageAt ? b : a,
    );
    try {
      await get().openProject(last.path);
    } catch {
      set((s) => {
        const recentProjects = s.recentProjects.filter(
          (p) => p.path !== last.path,
        );
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

  touchProjectActivity: (path) =>
    set((s) => {
      if (!s.recentProjects.some((p) => p.path === path)) return s;
      const recentProjects = s.recentProjects.map((p) =>
        p.path === path ? { ...p, lastMessageAt: Date.now() } : p,
      );
      saveRecentProjects(recentProjects);
      return { recentProjects };
    }),

  setProjectTitle: (path, title) =>
    set((s) => {
      const recentProjects = s.recentProjects.map((project) =>
        project.path === path ? { ...project, title } : project,
      );
      saveRecentProjects(recentProjects);
      return { recentProjects };
    }),
});
