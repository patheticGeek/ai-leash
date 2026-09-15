import type { StateCreator } from "zustand";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { AppStore } from "./index";
import { localStorageJson } from "./localStorageJson";

export type PanelTabKind =
  | "filetree"
  | "subagents"
  | "acp-events"
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

export interface ConversationChatState {
  chatTabs: ChatTab[];
  activeChatTabId: string;
}

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

// Disk-persisted counterpart of `panelStateByConversation`/
// `chatStateByConversation` — same shape, merged, keyed by conversation id.
// Written only for conversations that have actually been sent (see
// `persistActiveSessionTabState`'s doc comment), so a new/unsent thread's
// tabs never make it here and are gone once the app restarts. Read back at
// module load to seed both in-memory maps, so `conversationSlice`'s existing
// switch-time restore logic (`get().panelStateByConversation[id]` /
// `get().chatStateByConversation[id]`) transparently picks up whatever was
// saved on a previous run without needing its own separate restore path.
interface PersistedTabState
  extends ConversationPanelState,
    ConversationChatState {}

function loadPersistedTabState(): Record<string, PersistedTabState> {
  const parsed = localStorageJson.read<unknown>(LS_KEYS.tabState, {});
  return parsed && typeof parsed === "object"
    ? (parsed as Record<string, PersistedTabState>)
    : {};
}

function savePersistedTabState(map: Record<string, PersistedTabState>) {
  localStorageJson.write(LS_KEYS.tabState, map);
}

const persistedTabState = loadPersistedTabState();

export interface PanelSlice {
  panelTabs: PanelTab[];
  activePanelTabId: string | null;
  panelStateByConversation: Record<string, ConversationPanelState>;
  chatTabs: ChatTab[];
  activeChatTabId: string;
  // In-memory snapshot of every *other* conversation's chat tabs, keyed by
  // conversation id — same role as `panelStateByConversation`, kept as a
  // separate map since a chat tab's shape has nothing in common with a
  // panel tab's. Populated/restored by `conversationSlice`'s
  // `openConversation`/`startNewConversation`, seeded at startup from
  // `persistedTabState` so a previous run's sub-agent tabs reappear the
  // first time that conversation is switched into, not just after this one
  // mutates its tabs again.
  chatStateByConversation: Record<string, ConversationChatState>;
  // Which sessions (by session id — a project's own path, for a top-level
  // conversation) currently have a turn in flight, driven entirely by the
  // backend's `chat://{sessionId}/generating` event rather than any
  // frontend action — see `LeftBar.tsx`, the always-mounted subscriber.
  generatingSessions: Record<string, boolean>;
  // Which of those active sessions are running an *autonomous* turn right
  // now — the model reacting to a finished background sub-agent, not
  // anything the user just sent. `ChatPanel.tsx` uses this to avoid
  // showing the Stop button / blocking new sends for a turn the user isn't
  // actually waiting on; `LeftBar.tsx`'s busy dot ignores it (any activity
  // still lights it up).
  autonomousGeneratingSessions: Record<string, boolean>;
  openPanelTab: (
    kind: PanelTabKind,
    opts?: { path?: string; label?: string },
  ) => void;
  closePanelTab: (id: string) => void;
  setActivePanelTab: (id: string) => void;
  openChatTab: (subSessionId: string, label: string) => void;
  closeChatTab: (id: string) => void;
  setActiveChatTab: (id: string) => void;
  setSessionGenerating: (
    sessionId: string,
    generating: boolean,
    autonomous: boolean,
  ) => void;
  // Drops a deleted conversation's saved panel-/chat-tab snapshots (both the
  // in-memory maps and their disk-persisted entry) and any leftover
  // generating/autonomous flags — called by
  // `conversationSlice.deleteConversation`, mirroring
  // `acpSlice.forgetConversationBackend`/`permissionSlice.forgetPermissionMode`.
  // The `["generating", sessionId]` query cache entry (see
  // `generatingQuery.ts`) needs no equivalent cleanup — React Query garbage
  // collects it on its own once nothing's observing that key anymore.
  forgetConversationPanelState: (sessionId: string) => void;
  // Writes the *currently active* session's `panelTabs`/`activePanelTabId`/
  // `chatTabs`/`activeChatTabId` to disk, keyed by its conversation id — a
  // no-op if there's no active session or it's a new/unsent thread (not yet
  // in `conversations`), per the "don't remember tabs for a new thread"
  // requirement: such a thread isn't listed yet and won't be reachable
  // again after a restart anyway. Called after every tab
  // open/close/activate below, and once more from
  // `conversationSlice.markConversationStarted` to catch tabs opened before
  // a brand new thread's first message flipped it into a real,
  // disk-worthy conversation.
  persistActiveSessionTabState: () => void;
}

export const panelSlice: StateCreator<AppStore, [], [], PanelSlice> = (
  set,
  get,
) => ({
  // Always starts empty/primary-only, even if a previous run persisted tab
  // state: `initializeStartupSession` (`conversationSlice.ts`) always opens
  // a fresh new thread on boot rather than reselecting the last real
  // conversation, so there's nothing to restore into these top-level fields
  // yet. They only get populated from `panelStateByConversation`/
  // `chatStateByConversation` below once the user actually switches into a
  // previously-open conversation via `openConversation`.
  panelTabs: [],
  activePanelTabId: null,
  panelStateByConversation: Object.fromEntries(
    Object.entries(persistedTabState).map(([id, v]) => [
      id,
      { panelTabs: v.panelTabs, activePanelTabId: v.activePanelTabId },
    ]),
  ),
  chatTabs: [PRIMARY_CHAT_TAB],
  activeChatTabId: "primary",
  chatStateByConversation: Object.fromEntries(
    Object.entries(persistedTabState).map(([id, v]) => [
      id,
      { chatTabs: v.chatTabs, activeChatTabId: v.activeChatTabId },
    ]),
  ),
  generatingSessions: {},
  autonomousGeneratingSessions: {},

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
      get().persistActiveSessionTabState();
      return;
    }
    const defaultLabels: Record<PanelTabKind, string> = {
      filetree: "Files",
      subagents: "Sub Agents",
      "acp-events": "ACP Events",
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
    get().persistActiveSessionTabState();
  },

  closePanelTab: (id) => {
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
    });
    get().persistActiveSessionTabState();
  },

  setActivePanelTab: (id) => {
    set((s) => {
      const tab = s.panelTabs.find((t) => t.id === id);
      return {
        activePanelTabId: id,
        activePath: tab?.kind === "file" ? (tab.path ?? null) : null,
      };
    });
    get().persistActiveSessionTabState();
  },

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
    get().persistActiveSessionTabState();
  },

  closeChatTab: (id) => {
    set((s) => {
      if (id === "primary") return s;
      const chatTabs = s.chatTabs.filter((t) => t.id !== id);
      const activeChatTabId =
        s.activeChatTabId === id ? "primary" : s.activeChatTabId;
      return { chatTabs, activeChatTabId };
    });
    get().persistActiveSessionTabState();
  },

  setActiveChatTab: (id) => {
    set({ activeChatTabId: id });
    get().persistActiveSessionTabState();
  },

  setSessionGenerating: (sessionId, generating, autonomous) =>
    set((s) => {
      const already = !!s.generatingSessions[sessionId];
      const alreadyAutonomous = !!s.autonomousGeneratingSessions[sessionId];
      if (generating === already && autonomous === alreadyAutonomous) return s;

      const next = { ...s.generatingSessions };
      const nextAutonomous = { ...s.autonomousGeneratingSessions };
      if (generating) {
        next[sessionId] = true;
        if (autonomous) {
          nextAutonomous[sessionId] = true;
        } else {
          delete nextAutonomous[sessionId];
        }
      } else {
        delete next[sessionId];
        delete nextAutonomous[sessionId];
      }
      return {
        generatingSessions: next,
        autonomousGeneratingSessions: nextAutonomous,
      };
    }),

  forgetConversationPanelState: (sessionId) => {
    set((s) => {
      const panelStateByConversation = { ...s.panelStateByConversation };
      const chatStateByConversation = { ...s.chatStateByConversation };
      const generatingSessions = { ...s.generatingSessions };
      const autonomousGeneratingSessions = {
        ...s.autonomousGeneratingSessions,
      };
      delete panelStateByConversation[sessionId];
      delete chatStateByConversation[sessionId];
      delete generatingSessions[sessionId];
      delete autonomousGeneratingSessions[sessionId];
      return {
        panelStateByConversation,
        chatStateByConversation,
        generatingSessions,
        autonomousGeneratingSessions,
      };
    });
    const map = loadPersistedTabState();
    if (sessionId in map) {
      delete map[sessionId];
      savePersistedTabState(map);
    }
  },

  persistActiveSessionTabState: () => {
    const s = get();
    const id = s.activeSessionId;
    if (!id || !s.conversations.some((c) => c.id === id)) return;
    const map = loadPersistedTabState();
    map[id] = {
      panelTabs: s.panelTabs,
      activePanelTabId: s.activePanelTabId,
      chatTabs: s.chatTabs,
      activeChatTabId: s.activeChatTabId,
    };
    savePersistedTabState(map);
  },
});
