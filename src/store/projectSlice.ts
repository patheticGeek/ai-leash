import type { StateCreator } from "zustand";
import { getConversations } from "../data/conversations";
import { LS_KEYS } from "../lib/localStorageKeys";
import { api } from "../lib/tauriApi";
import type { AppStore } from "./index";
import { localStorageJson } from "./localStorageJson";
import { PRIMARY_CHAT_TAB } from "./panelSlice";

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
  const parsed = localStorageJson.read<unknown>(LS_KEYS.recentProjects, []);
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed.map((p) => ({ path: p.path, name: p.name }));
  }
  // One-time migration from the old single-project key (pre-multi-project sidebar).
  const legacy = localStorage.getItem(LS_KEYS.lastProjectRoot);
  if (!legacy) return [];
  const migrated = [
    {
      path: legacy,
      name: legacy.split("/").filter(Boolean).pop() ?? legacy,
    },
  ];
  localStorageJson.write(LS_KEYS.recentProjects, migrated);
  localStorage.removeItem(LS_KEYS.lastProjectRoot);
  return migrated;
}

function saveRecentProjects(projects: RecentProject[]) {
  localStorageJson.write(LS_KEYS.recentProjects, projects);
}

export interface ProjectSlice {
  projectRoot: string | null;
  // Stable project UUID for `projectRoot` (`db::ensure_project`'s id, from
  // `api.setProjectRoot`'s return value) — set alongside `projectRoot` by
  // `conversationSlice.ts`'s `openConversation`/`startNewConversation`.
  // Distinct from the path itself so debug tooling (the top bar's id display)
  // can show a real identity that survives the project folder being moved
  // or renamed on disk.
  projectId: string | null;
  openFiles: OpenFile[];
  activePath: string | null;
  recentProjects: RecentProject[];
  // Onboards a brand new project folder (the "Add project" flow:
  // `pickAndAddProject`, from the sidebar, the new-thread project picker and
  // `NoProjectState`'s CTA) and starts a
  // fresh conversation for it — see `conversationSlice.startNewConversation`.
  addProject: (dir: string) => Promise<void>;
  // Forgets a project folder for good — including deleting every
  // conversation it has, not just the folder entry, so removing a project
  // doesn't leave orphaned conversation rows in the sidebar with no project
  // name to show. Routes each deletion through
  // `conversationSlice.deleteConversation` rather than calling
  // `api.deleteConversation` directly, so the same
  // localStorage/sub-agent-bookkeeping cleanup that a normal per-conversation
  // delete does can't drift out of sync with this bulk path. Reachable from the
  // sidebar project group's ⋯ / right-click menu (`LeftBar.tsx`'s
  // `ProjectGroup`), behind `RemoveProjectDialog`.
  removeProject: (root: string) => Promise<void>;
  // `lines`: also scroll to and select those lines (1-based, inclusive) —
  // an inline `@path:12-18` badge's click. `FileEditorTab` picks it up from
  // `revealLines` and clears it.
  openFile: (
    path: string,
    name: string,
    lines?: { startLine: number; endLine: number },
  ) => Promise<void>;
  revealLines: { path: string; startLine: number; endLine: number } | null;
  clearRevealLines: () => void;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  // Re-reads every open file with no unsaved edits that sits in one of
  // `changedDirs` (an `fs://changed` payload — see `useFsChangeInvalidator`),
  // so an agent's edit shows up in its open tab and the review comments on
  // it re-anchor. A file with unsaved edits keeps them.
  reloadChangedFiles: (changedDirs: string[]) => Promise<void>;
}

export const projectSlice: StateCreator<AppStore, [], [], ProjectSlice> = (
  set,
  get,
) => ({
  projectRoot: null,
  projectId: null,
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
    // Each `deleteConversation` call already removes its own row from the
    // query cache (`removeConversation`), so by the time this resolves the
    // list needs no further filtering here — only this slice's own state.
    const toDelete = getConversations().filter((c) => c.projectRoot === root);
    await Promise.all(toDelete.map((c) => get().deleteConversation(c.id)));
    await api.deleteProjectBoard(root);
    set((s) => {
      const recentProjects = s.recentProjects.filter((p) => p.path !== root);
      saveRecentProjects(recentProjects);
      if (s.projectRoot !== root) return { recentProjects };
      return {
        recentProjects,
        projectRoot: null,
        projectId: null,
        activeSessionId: null,
        draft: null,
        viewEpoch: s.viewEpoch + 1,
        openFiles: [],
        activePath: null,
        panelTabs: [],
        activePanelTabId: null,
        chatTabs: [PRIMARY_CHAT_TAB],
        activeChatTabId: "primary",
      };
    });
  },

  revealLines: null,
  clearRevealLines: () => set({ revealLines: null }),

  openFile: async (path, name, lines) => {
    // No session in a new thread — Rust then reads from the checkout it's
    // showing (`set_view_root`).
    const { activeSessionId: sessionId, draft } = get();
    if (!sessionId && !draft) return;
    if (!get().openFiles.some((f) => f.path === path)) {
      const content = await api.readFileText(sessionId, path);
      set((s) => ({
        openFiles: [...s.openFiles, { path, name, content, dirty: false }],
      }));
    }
    if (lines) set({ revealLines: { path, ...lines } });
    get().openPanelTab("file", { path, label: name });
  },

  setActive: (path) => set({ activePath: path }),

  updateContent: (path, content) =>
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, content, dirty: true } : f,
      ),
    })),

  saveFile: async (path) => {
    const { openFiles, activeSessionId, draft } = get();
    const file = openFiles.find((f) => f.path === path);
    if (!file || (!activeSessionId && !draft)) return;
    await api.writeFileText(activeSessionId, file.path, file.content);
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === file.path ? { ...f, dirty: false } : f,
      ),
    }));
  },

  reloadChangedFiles: async (changedDirs) => {
    const { openFiles, activeSessionId, draft } = get();
    if (!activeSessionId && !draft) return;
    const changed = new Set(changedDirs);
    const stale = openFiles.filter(
      (f) =>
        !f.dirty &&
        changed.has(
          f.path.slice(
            0,
            Math.max(f.path.lastIndexOf("/"), f.path.lastIndexOf("\\")),
          ),
        ),
    );
    await Promise.all(
      stale.map(async (file) => {
        let content: string;
        try {
          content = await api.readFileText(activeSessionId, file.path);
        } catch {
          // Deleted or unreadable: keep what's open.
          return;
        }
        // Still the same conversation, and not typed into meanwhile.
        if (get().activeSessionId !== activeSessionId) return;
        set((s) => ({
          openFiles: s.openFiles.map((f) =>
            f.path === file.path && !f.dirty && f.content !== content
              ? { ...f, content }
              : f,
          ),
        }));
      }),
    );
  },
});
