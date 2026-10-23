import type { StateCreator } from "zustand";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { AppStore } from "./index";
import { localStorageJson } from "./localStorageJson";

// The left sidebar's collapsible sections — see `LeftBar.tsx`.
export type SidebarSection = "boards" | "chats" | "done";

const SIDEBAR_SECTIONS: readonly SidebarSection[] = ["boards", "chats", "done"];

// Only collapsed sections are stored, so every section (including any added
// later) defaults to expanded.
function loadCollapsedSections(): Record<SidebarSection, boolean> {
  const parsed = localStorageJson.read<unknown>(
    LS_KEYS.sidebarCollapsedSections,
    [],
  );
  const stored = Array.isArray(parsed) ? parsed : [];
  return Object.fromEntries(
    SIDEBAR_SECTIONS.map((section) => [section, stored.includes(section)]),
  ) as Record<SidebarSection, boolean>;
}

export interface SidebarSlice {
  sidebarCollapsed: Record<SidebarSection, boolean>;
  setSidebarSectionCollapsed: (
    section: SidebarSection,
    collapsed: boolean,
  ) => void;
}

export const sidebarSlice: StateCreator<AppStore, [], [], SidebarSlice> = (
  set,
  get,
) => ({
  sidebarCollapsed: loadCollapsedSections(),

  setSidebarSectionCollapsed: (section, collapsed) => {
    const next = { ...get().sidebarCollapsed, [section]: collapsed };
    set({ sidebarCollapsed: next });
    localStorageJson.write(
      LS_KEYS.sidebarCollapsedSections,
      SIDEBAR_SECTIONS.filter((s) => next[s]),
    );
  },
});
