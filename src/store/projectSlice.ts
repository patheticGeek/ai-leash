import type { StateCreator } from "zustand";
import { api } from "../lib/tauriApi";
import type { AppStore } from "./index";
import { PRIMARY_CHAT_TAB } from "./panelSlice";

const RECENT_PROJECTS_KEY = "ai-leash:recentProjects";

interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

// Just a known project folder now — per-conversation concerns (title,
// activity recency) moved to `conversationSlice.ts`'s `ConversationSummary`
// once a project could have more than one conversation.
export interface RecentProject {
  path: string;
  name: string;
}

function loadRecentProjects(): RecentProject[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(RECENT_PROJECTS_KEY) ?? "[]",
    );
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((p) => ({ path: p.path, name: p.name }));
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
  // Onboards a brand new project folder (the "Add project" flow in
  // `NewConversationPopover.tsx` and `NoProjectState`'s CTA) and starts a
  // fresh conversation for it — see `conversationSlice.startNewConversation`.
  addProject: (dir: string) => Promise<void>;
  // Forgets a project folder for good — including deleting every
  // conversation it has (backend `delete_conversation` for each, plus
  // local state), not just the folder entry, so removing a project doesn't
  // leave orphaned conversation rows in the sidebar with no project name to
  // show. Reachable from `NewConversationPopover.tsx`'s project list.
  removeProject: (root: string) => Promise<void>;
  openFile: (path: string, name: string) => Promise<void>;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveActive: () => Promise<void>;
}

export const projectSlice: StateCreator<AppStore, [], [], ProjectSlice> = (
  set,
  get,
) => ({
  projectRoot: null,
  openFiles: [],
  activePath: null,
  recentProjects: loadRecentProjects(),

  addProject: async (dir) => {
    set((s) => {
      if (s.recentProjects.some((p) => p.path === dir)) return s;
      const name = dir.split("/").filter(Boolean).pop() ?? dir;
      const recentProjects = [...s.recentProjects, { path: dir, name }];
      saveRecentProjects(recentProjects);
      return { recentProjects };
    });
    await get().startNewConversation(dir);
  },

  removeProject: async (root) => {
    const toDelete = get().conversations.filter((c) => c.projectRoot === root);
    await Promise.all(toDelete.map((c) => api.deleteConversation(c.id)));
    set((s) => {
      const recentProjects = s.recentProjects.filter((p) => p.path !== root);
      saveRecentProjects(recentProjects);
      const conversations = s.conversations.filter(
        (c) => c.projectRoot !== root,
      );
      if (s.projectRoot !== root) return { recentProjects, conversations };
      return {
        recentProjects,
        conversations,
        projectRoot: null,
        activeSessionId: null,
        openFiles: [],
        activePath: null,
        panelTabs: [],
        activePanelTabId: null,
        chatTabs: [PRIMARY_CHAT_TAB],
        activeChatTabId: "primary",
      };
    });
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
});
