import type { StateCreator } from "zustand";
import type { AppStore } from "./index";

export type PanelTabKind =
  | "filetree"
  | "subagents"
  | "terminal"
  | "file"
  | "actions"
  | "action";

export interface PanelTab {
  id: string;
  kind: PanelTabKind;
  /** Also doubles as the Action id when kind is "action", same as it
   * already doubles as a filesystem path when kind is "file". */
  path?: string;
  label: string;
}

export interface ConversationPanelState {
  panelTabs: PanelTab[];
  activePanelTabId: string | null;
}

export type ChatTabKind = "primary" | "subagent";

export type ChatTab =
  | { id: string; kind: "primary"; label: string }
  | { id: string; kind: "subagent"; subSessionId: string; label: string };

export const PRIMARY_CHAT_TAB: ChatTab = {
  id: "primary",
  kind: "primary",
  label: "Agent",
};

export function panelTabIdFor(kind: PanelTabKind, path?: string): string {
  if (kind === "file") return `file:${path}`;
  if (kind === "action") return `action:${path}`;
  if (kind === "terminal") return `terminal:${crypto.randomUUID()}`;
  return kind;
}

export interface PanelSlice {
  panelTabs: PanelTab[];
  activePanelTabId: string | null;
  panelStateByConversation: Record<string, ConversationPanelState>;
  chatTabs: ChatTab[];
  activeChatTabId: string;
  openPanelTab: (
    kind: PanelTabKind,
    opts?: { path?: string; label?: string },
  ) => void;
  closePanelTab: (id: string) => void;
  setActivePanelTab: (id: string) => void;
  openChatTab: (subSessionId: string, label: string) => void;
  closeChatTab: (id: string) => void;
  setActiveChatTab: (id: string) => void;
  // Drops a deleted conversation's saved panel-tab snapshot — called by
  // `conversationSlice.deleteConversation`, mirroring
  // `acpSlice.forgetConversationBackend`/`permissionSlice.forgetPermissionMode`.
  // The `["generating", sessionId]` query cache entry (see
  // `generatingQuery.ts`) needs no equivalent cleanup — React Query garbage
  // collects it on its own once nothing's observing that key anymore.
  forgetConversationPanelState: (sessionId: string) => void;
}

export const panelSlice: StateCreator<AppStore, [], [], PanelSlice> = (
  set,
  get,
) => ({
  panelTabs: [],
  activePanelTabId: null,
  panelStateByConversation: {},
  chatTabs: [PRIMARY_CHAT_TAB],
  activeChatTabId: "primary",

  openPanelTab: (kind, opts) => {
    const id =
      kind === "file" || kind === "action"
        ? panelTabIdFor(kind, opts?.path)
        : panelTabIdFor(kind);
    const existing = get().panelTabs.find((t) => t.id === id);
    if (existing) {
      set({
        activePanelTabId: id,
        activePath: existing.kind === "file" ? (existing.path ?? null) : null,
      });
      return;
    }
    const defaultLabels: Record<PanelTabKind, string> = {
      filetree: "Files",
      subagents: "Sub Agents",
      terminal: `Terminal ${get().panelTabs.filter((t) => t.kind === "terminal").length + 1}`,
      file: opts?.label ?? "file",
      actions: "Actions",
      action: opts?.label ?? "action",
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
        closed.kind === "file"
          ? s.openFiles.filter((f) => f.path !== closed.path)
          : s.openFiles;

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
        chatTabs: [
          ...s.chatTabs,
          { id, kind: "subagent", subSessionId, label },
        ],
        activeChatTabId: id,
      };
    });
  },

  closeChatTab: (id) =>
    set((s) => {
      if (id === "primary") return s;
      const chatTabs = s.chatTabs.filter((t) => t.id !== id);
      const activeChatTabId =
        s.activeChatTabId === id ? "primary" : s.activeChatTabId;
      return { chatTabs, activeChatTabId };
    }),

  setActiveChatTab: (id) => set({ activeChatTabId: id }),

  forgetConversationPanelState: (sessionId) =>
    set((s) => {
      const panelStateByConversation = { ...s.panelStateByConversation };
      delete panelStateByConversation[sessionId];
      return { panelStateByConversation };
    }),
});
