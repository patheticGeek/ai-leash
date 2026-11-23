import type { StateCreator } from "zustand";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { AppStore } from "./index";
import { localStorageJson } from "./localStorageJson";

// Which of the left sidebar's groups are folded — see `LeftBar.tsx`. Project
// groups default to open, so only the folded ones are stored (a project added
// later starts open); Done defaults to folded, so only "open" is stored.
interface StoredSidebarGroups {
  collapsedProjects: string[];
  isDoneOpen: boolean;
}

function loadSidebarGroups(): StoredSidebarGroups {
  const parsed = localStorageJson.read<Partial<StoredSidebarGroups> | null>(
    LS_KEYS.sidebarGroups,
    null,
  );
  return {
    collapsedProjects: Array.isArray(parsed?.collapsedProjects)
      ? parsed.collapsedProjects.filter((p) => typeof p === "string")
      : [],
    isDoneOpen: parsed?.isDoneOpen === true,
  };
}

export interface SidebarSlice {
  // Project roots whose sidebar group is folded.
  sidebarCollapsedProjects: string[];
  // Whether the Done group at the bottom of the sidebar is open.
  sidebarDoneOpen: boolean;
  setSidebarProjectCollapsed: (projectRoot: string, collapsed: boolean) => void;
  setSidebarDoneOpen: (open: boolean) => void;
}

export const sidebarSlice: StateCreator<AppStore, [], [], SidebarSlice> = (
  set,
  get,
) => {
  const initial = loadSidebarGroups();
  const persist = () =>
    localStorageJson.write(LS_KEYS.sidebarGroups, {
      collapsedProjects: get().sidebarCollapsedProjects,
      isDoneOpen: get().sidebarDoneOpen,
    } satisfies StoredSidebarGroups);

  return {
    sidebarCollapsedProjects: initial.collapsedProjects,
    sidebarDoneOpen: initial.isDoneOpen,

    setSidebarProjectCollapsed: (projectRoot, collapsed) => {
      const others = get().sidebarCollapsedProjects.filter(
        (p) => p !== projectRoot,
      );
      set({
        sidebarCollapsedProjects: collapsed ? [...others, projectRoot] : others,
      });
      persist();
    },

    setSidebarDoneOpen: (open) => {
      set({ sidebarDoneOpen: open });
      persist();
    },
  };
};
