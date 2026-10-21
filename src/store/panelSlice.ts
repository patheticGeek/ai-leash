import type { StateCreator } from "zustand";
import { getConversations } from "../data/conversations";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { AppStore } from "./index";
import { localStorageJson } from "./localStorageJson";

// Kinds `openPanelTab` opens (into the side panel by default).
export type PanelTabKind =
  | "filetree"
  | "subagents"
  | "terminal"
  | "file"
  | "actions"
  | "action";

// Every tab kind, either area: the panel kinds above plus the chat kinds
// `CenterPanel` has always shown. Any tab can be dragged between the centre
// and side areas (see `TabDnd.tsx`) except the primary Agent tab, which is
// pinned to the centre.
export type TabKind = PanelTabKind | "primary" | "subagent";

export type TabArea = "center" | "side";

export interface WorkspaceTab {
  id: string;
  kind: TabKind;
  /** Also doubles as the Action id when kind is "action", same as it
   * already doubles as a filesystem path when kind is "file". */
  path?: string;
  /** Terminal tabs only: text typed (not executed) at the prompt on open. */
  command?: string;
  /** Sub-agent tabs only: the sub-agent session whose transcript it shows. */
  subSessionId?: string;
  label: string;
}

// `panelTabs` is the side area, `chatTabs` the centre area — named for what
// each held before tabs could move between them, and kept so persisted tab
// state from earlier runs still loads.
export interface ConversationPanelState {
  panelTabs: WorkspaceTab[];
  activePanelTabId: string | null;
}

export interface ConversationChatState {
  chatTabs: WorkspaceTab[];
  activeChatTabId: string;
}

export const PRIMARY_TAB_ID = "primary";

export const PRIMARY_CHAT_TAB: WorkspaceTab = {
  id: PRIMARY_TAB_ID,
  kind: "primary",
  label: "Agent",
};

type TabState = Pick<
  PanelSlice,
  "panelTabs" | "activePanelTabId" | "chatTabs" | "activeChatTabId"
>;

export function tabAreaOf(s: TabState, id: string): TabArea | null {
  if (s.chatTabs.some((t) => t.id === id)) return "center";
  if (s.panelTabs.some((t) => t.id === id)) return "side";
  return null;
}

// The file the file tree highlights: the active tab of `preferred` if it's a
// file, else the other area's active tab if that one is.
function activePathFor(s: TabState, preferred: TabArea): string | null {
  const center = s.chatTabs.find((t) => t.id === s.activeChatTabId);
  const side = s.panelTabs.find((t) => t.id === s.activePanelTabId);
  const order = preferred === "center" ? [center, side] : [side, center];
  return order.find((t) => t?.kind === "file")?.path ?? null;
}

// Neighbour to activate when the active tab at `idx` leaves `tabs` (already
// without it) — the centre always falls back to the pinned primary tab.
function nextActive(
  tabs: WorkspaceTab[],
  idx: number,
  area: TabArea,
): string | null {
  const next = tabs[idx] ?? tabs[idx - 1] ?? null;
  return next?.id ?? (area === "center" ? PRIMARY_TAB_ID : null);
}

// Drops every tab matching `remove` from both areas (never the primary tab),
// re-picking each area's active tab and the open-file buffers to match.
export function withoutTabs(
  s: TabState & Pick<AppStore, "openFiles" | "activePath">,
  remove: (t: WorkspaceTab) => boolean,
): Partial<AppStore> {
  const drop = (t: WorkspaceTab) => t.kind !== "primary" && remove(t);
  const removed = [...s.chatTabs, ...s.panelTabs].filter(drop);
  if (removed.length === 0) return {};
  const chatTabs = s.chatTabs.filter((t) => !drop(t));
  const panelTabs = s.panelTabs.filter((t) => !drop(t));
  const pick = (
    tabs: WorkspaceTab[],
    kept: WorkspaceTab[],
    active: string | null,
    area: TabArea,
  ) =>
    kept.some((t) => t.id === active)
      ? active
      : nextActive(
          kept,
          tabs.findIndex((t) => t.id === active),
          area,
        );
  const next: TabState = {
    chatTabs,
    panelTabs,
    activeChatTabId:
      pick(s.chatTabs, chatTabs, s.activeChatTabId, "center") ?? PRIMARY_TAB_ID,
    activePanelTabId: pick(s.panelTabs, panelTabs, s.activePanelTabId, "side"),
  };
  const closedPaths = new Set(
    removed.filter((t) => t.kind === "file").map((t) => t.path),
  );
  return {
    ...next,
    openFiles: s.openFiles.filter((f) => !closedPaths.has(f.path)),
    activePath: activePathFor(
      next,
      tabAreaOf(s, removed[0].id) === "center" ? "center" : "side",
    ),
  };
}

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
  settingsModalOpen: boolean;
  setSettingsModalOpen: (open: boolean) => void;
  panelTabs: WorkspaceTab[];
  activePanelTabId: string | null;
  panelStateByConversation: Record<string, ConversationPanelState>;
  chatTabs: WorkspaceTab[];
  activeChatTabId: string;
  // In-memory snapshot of every *other* conversation's chat tabs, keyed by
  // conversation id — same role as `panelStateByConversation`, kept as a
  // separate map for the centre area's tabs. Populated/restored by `conversationSlice`'s
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
  // Opens a tab in the side area — or, if it's already open in either area,
  // activates it where it is.
  openPanelTab: (
    kind: PanelTabKind,
    opts?: { path?: string; label?: string; command?: string },
  ) => void;
  // Same, for a sub-agent's transcript, opening in the centre area.
  openChatTab: (subSessionId: string, label: string) => void;
  // Both take a tab in either area.
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  // Moves a tab to `index` in `area` (same area: a reorder) and activates it
  // there. A no-op for the primary tab outside the centre.
  moveTab: (id: string, area: TabArea, index: number) => void;
  setSessionGenerating: (
    sessionId: string,
    generating: boolean,
    autonomous: boolean,
  ) => void;
  // Drops a deleted conversation's saved panel-/chat-tab snapshots (both the
  // in-memory maps and their disk-persisted entry) and any leftover
  // generating/autonomous flags — called by
  // `conversationSlice.deleteConversation`, mirroring
  // `selectionSlice.forgetConversationBackend`/`permissionSlice.forgetPermissionMode`.
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
  settingsModalOpen: false,
  setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),
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
    if (tabAreaOf(get(), id)) {
      get().activateTab(id);
      return;
    }
    const defaultLabels: Record<PanelTabKind, string> = {
      filetree: "Files",
      subagents: "Sub Agents",
      terminal: `Terminal ${
        [...get().chatTabs, ...get().panelTabs].filter(
          (t) => t.kind === "terminal",
        ).length + 1
      }`,
      file: opts?.label ?? "file",
      actions: "Actions",
      action: opts?.label ?? "action",
    };
    const tab: WorkspaceTab = {
      id,
      kind,
      path: opts?.path,
      command: opts?.command,
      label: opts?.label ?? defaultLabels[kind],
    };
    set((s) => {
      const next = {
        ...s,
        panelTabs: [...s.panelTabs, tab],
        activePanelTabId: id,
      };
      return {
        panelTabs: next.panelTabs,
        activePanelTabId: id,
        activePath: activePathFor(next, "side"),
      };
    });
    get().persistActiveSessionTabState();
  },

  openChatTab: (subSessionId, label) => {
    const id = `subagent:${subSessionId}`;
    if (tabAreaOf(get(), id)) {
      get().activateTab(id);
      return;
    }
    set((s) => ({
      chatTabs: [...s.chatTabs, { id, kind: "subagent", subSessionId, label }],
      activeChatTabId: id,
    }));
    get().persistActiveSessionTabState();
  },

  activateTab: (id) => {
    set((s) => {
      const area = tabAreaOf(s, id);
      if (!area) return s;
      const next =
        area === "center"
          ? { ...s, activeChatTabId: id }
          : { ...s, activePanelTabId: id };
      return {
        activeChatTabId: next.activeChatTabId,
        activePanelTabId: next.activePanelTabId,
        activePath: activePathFor(next, area),
      };
    });
    get().persistActiveSessionTabState();
  },

  closeTab: (id) => {
    set((s) => withoutTabs(s, (t) => t.id === id));
    get().persistActiveSessionTabState();
  },

  moveTab: (id, area, index) => {
    set((s) => {
      const from = tabAreaOf(s, id);
      if (!from || (id === PRIMARY_TAB_ID && area !== "center")) return s;
      const source = from === "center" ? s.chatTabs : s.panelTabs;
      const fromIdx = source.findIndex((t) => t.id === id);
      const tab = source[fromIdx];
      const chatTabs = s.chatTabs.filter((t) => t.id !== id);
      const panelTabs = s.panelTabs.filter((t) => t.id !== id);
      const dest = area === "center" ? chatTabs : panelTabs;
      dest.splice(Math.max(0, Math.min(index, dest.length)), 0, tab);
      const next: TabState = {
        chatTabs,
        panelTabs,
        activeChatTabId: s.activeChatTabId,
        activePanelTabId: s.activePanelTabId,
      };
      if (area === "center") next.activeChatTabId = id;
      else next.activePanelTabId = id;
      // Moved out of the area it was active in — that area falls back to
      // the tab beside where it was.
      if (from !== area) {
        if (from === "center" && s.activeChatTabId === id) {
          next.activeChatTabId =
            nextActive(chatTabs, fromIdx, "center") ?? PRIMARY_TAB_ID;
        } else if (from === "side" && s.activePanelTabId === id) {
          next.activePanelTabId = nextActive(panelTabs, fromIdx, "side");
        }
      }
      return { ...next, activePath: activePathFor(next, area) };
    });
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
    if (!id || !getConversations().some((c) => c.id === id)) return;
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
