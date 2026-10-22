import type { StateCreator } from "zustand";
import {
  forgetPrefetchedConversationHistory,
  prefetchConversationHistory,
} from "../data/conversationHistory";
import {
  fetchConversations,
  getConversations,
  insertConversation,
  patchConversation,
  refreshConversations,
  removeConversation,
} from "../data/conversations";
import { chatDraftKey } from "../lib/chatDraft";
import { api } from "../lib/tauriApi";
import type { AppStore } from "./index";
import type { WorkspaceTab } from "./panelSlice";
import { PRIMARY_CHAT_TAB } from "./panelSlice";
import type { PermissionMode } from "./permissionSlice";
import type { ConversationBackendSelection } from "./selectionSlice";

// The canonical shape now lives in `lib/tauriApi.ts` (the wire type) and is
// re-exported via `data/conversations.ts` — this file only owns the actions
// around it, not the type itself. Re-exported here too so existing imports
// (`store/index.ts`, `selectionSlice.ts`, `permissionSlice.ts`) don't all need a
// new import path.
export type { ConversationSummary } from "../data/conversations";

import type { ConversationSummary } from "../data/conversations";

// The resolved checkout a conversation runs in — a worktree, or the
// project's primary checkout when there isn't one. Backend state that's
// scoped per-checkout rather than per-conversation (see `actions.rs`'s
// `run_key`) should key off this, not off a conversation/session id:
// multiple conversations routinely share a checkout (every brand-new
// conversation defaults to the primary root), and nothing keeps that data
// in sync across sessions on its own.
export function conversationCheckoutPath(
  c: Pick<ConversationSummary, "worktreePath" | "projectRoot">,
): string {
  return c.worktreePath ?? c.projectRoot;
}

// A "new thread" that hasn't sent its first message yet: what it will start
// with once it does. Lives only here, in memory — it has no id, no row, and
// nothing about it exists in Rust or on disk (`promoteDraft` is where all of
// that starts). `selection`/`permissionMode` are null until something picks
// them, falling back to the app's defaults.
export interface NewThreadDraft {
  projectRoot: string;
  // `null` means the primary checkout.
  worktreePath: string | null;
  selection: ConversationBackendSelection | null;
  permissionMode: PermissionMode | null;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// Guards `openConversation`/`startNewConversation` against racing each
// other when called in rapid succession (e.g. double-clicking two
// different sidebar rows, or a click landing while `initializeStartupSession`
// is still resolving). Each call captures its own token right before the
// only `await` that can be outraced (`api.setProjectRoot`) and bails
// without touching any state if a newer switch has since started — so a
// slow response to an abandoned switch can never land after, and clobber,
// whichever switch actually "won". Deliberately a plain module-level
// counter rather than store state: it's pure call-ordering bookkeeping,
// nothing ever renders from it.
let latestSwitchToken = 0;

export interface ConversationSlice {
  // The conversation currently shown in the center pane — null while a new
  // thread (`draft`) is shown instead, or before any project is known. A
  // new thread gets its id only when its first message is sent
  // (`promoteDraft`).
  //
  // The list itself (`conversations`) is no longer Zustand state — see
  // `data/conversations.ts`'s `useConversations()`/`getConversations()` —
  // this slice keeps only what's genuinely per-session UI state, plus the
  // actions that drive both.
  activeSessionId: string | null;
  // The new thread being shown, if that's what's shown — see
  // `NewThreadDraft`.
  draft: NewThreadDraft | null;
  // Bumped by every switch (`openConversation`/`startNewConversation`) but
  // not by `promoteDraft` — `App.tsx` keys `CenterPanel` on it, so a new
  // thread turning into a real conversation keeps the same mounted panel
  // (and the composer's state) while a real switch still remounts.
  viewEpoch: number;
  // The checkout each known session is currently pinned to — mirrors
  // `conversations[*].worktreePath`, set ahead of the row itself landing.
  checkoutPathBySession: Record<string, string>;
  loadAllConversations: () => Promise<void>;
  initializeStartupSession: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  // Opens `projectRoot`'s board — its board chat, created on first use.
  openProjectBoard: (projectRoot: string) => Promise<void>;
  startNewConversation: (projectRoot: string) => Promise<void>;
  setDraftSelection: (selection: ConversationBackendSelection) => void;
  setDraftPermissionMode: (mode: PermissionMode) => void;
  setDraftWorktree: (worktreePath: string | null) => void;
  // Turns the shown new thread into a real conversation as its first
  // message is sent: mints its id, carries the draft's picks over to it and
  // lists it. Returns the id, or null if no new thread is shown.
  promoteDraft: () => string | null;
  markConversationStarted: (
    id: string,
    projectRoot: string,
    worktreePath?: string | null,
  ) => void;
  touchConversationActivity: (id: string) => void;
  setConversationTitle: (id: string, title: string | null) => void;
  setConversationDone: (id: string, done: boolean) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}

export const conversationSlice: StateCreator<
  AppStore,
  [],
  [],
  ConversationSlice
> = (set, get) => ({
  activeSessionId: null,
  draft: null,
  viewEpoch: 0,
  checkoutPathBySession: {},

  // Backend is the source of truth (SQLite, kept indefinitely) — a plain
  // fetch is safe here (no merge-with-optimistic-rows dance needed): this
  // only ever runs once, from `initializeStartupSession` at boot, before
  // anything could have optimistically inserted a still-unsent conversation
  // (`markConversationStarted`).
  loadAllConversations: async () => {
    const rows = await fetchConversations();
    get().hydrateConversationBackendFromRows(rows);
    get().hydratePermissionModeFromRows(rows);
  },

  // Runs once at app startup in place of the old `restoreLastProject` —
  // sets up the last-used project as a fresh "new thread" (so the title
  // bar can show "{project} / new thread" and file tools work if a
  // message is sent) without selecting any real, listed conversation.
  initializeStartupSession: async () => {
    await get().loadAllConversations();
    const conversations = getConversations();
    const { recentProjects } = get();
    if (recentProjects.length === 0) return;
    const lastConversation = [...conversations].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    )[0];
    const lastProjectRoot =
      lastConversation?.projectRoot ??
      recentProjects[recentProjects.length - 1].path;
    if (!recentProjects.some((p) => p.path === lastProjectRoot)) return;
    try {
      await get().startNewConversation(lastProjectRoot);
    } catch {
      set((s) => ({
        recentProjects: s.recentProjects.filter(
          (p) => p.path !== lastProjectRoot,
        ),
      }));
    }
  },

  // Switches to an already-listed conversation — sets the backend's global
  // project root (see the module doc on why this must happen: messages are
  // stamped with whichever project root is currently open, not one stored
  // per-conversation), then swaps panel/chat-tab state exactly like the old
  // `openProject` did, just keyed by conversation id instead of project path.
  openConversation: async (id) => {
    const conversation = getConversations().find((c) => c.id === id);
    if (!conversation) return;
    const { projectRoot } = conversation;
    const checkoutPath = conversationCheckoutPath(conversation);
    const token = ++latestSwitchToken;
    // Loaded alongside the round trips below rather than after the switch,
    // so the transcript is ready the moment `ChatPanel` mounts — see
    // `data/conversationHistory.ts`. A failure just leaves `useChatStream`
    // to load it itself, as it does for any other mount.
    const history = prefetchConversationHistory(id).catch(() => {});
    const projectId = await api.setProjectRoot(projectRoot);
    // Restores this conversation's own checkout (primary or worktree) —
    // separate from the global `project_root` above, which only drives the
    // file tree / terminal's "focused" project. See `BranchBar`.
    await api.setConversationRoot(id, projectRoot, checkoutPath);
    await history;
    // A newer switch (another click, or `startNewConversation`) started
    // while this one was awaiting the backend round trip — let it win
    // instead of overwriting whatever it already committed.
    if (token !== latestSwitchToken) {
      forgetPrefetchedConversationHistory(id);
      return;
    }

    // Read fresh, not before the `await` above — otherwise this could be
    // stamping a panel-state snapshot for a `prevSessionId` that's already
    // stale by the time it's actually written.
    const prevSessionId = get().activeSessionId;
    const prevPanelTabs = get().panelTabs;
    const prevActivePanelTabId = get().activePanelTabId;
    const prevChatTabs = get().chatTabs;
    const prevActiveChatTabId = get().activeChatTabId;

    const restored = get().panelStateByConversation[id];
    const restoredChat = get().chatStateByConversation[id];
    const restoredActiveFile = [
      restored?.panelTabs.find((t) => t.id === restored.activePanelTabId),
      restoredChat?.chatTabs.find((t) => t.id === restoredChat.activeChatTabId),
    ].find((t) => t?.kind === "file");

    set((s) => {
      const panelStateByConversation = { ...s.panelStateByConversation };
      const chatStateByConversation = { ...s.chatStateByConversation };
      const checkoutPathBySession = {
        ...s.checkoutPathBySession,
        [id]: checkoutPath,
      };
      if (prevSessionId) {
        panelStateByConversation[prevSessionId] = {
          panelTabs: prevPanelTabs,
          activePanelTabId: prevActivePanelTabId,
        };
        chatStateByConversation[prevSessionId] = {
          chatTabs: prevChatTabs,
          activeChatTabId: prevActiveChatTabId,
        };
      }
      return {
        projectRoot,
        projectId,
        activeSessionId: id,
        draft: null,
        viewEpoch: s.viewEpoch + 1,
        checkoutPathBySession,
        openFiles: [],
        activePath: restoredActiveFile?.path ?? null,
        panelTabs: restored?.panelTabs ?? [],
        activePanelTabId: restored?.activePanelTabId ?? null,
        panelStateByConversation,
        chatTabs: restoredChat?.chatTabs ?? [PRIMARY_CHAT_TAB],
        activeChatTabId: restoredChat?.activeChatTabId ?? "primary",
        chatStateByConversation,
      };
    });

    const fileTabs = [
      ...(restored?.panelTabs ?? []),
      ...(restoredChat?.chatTabs ?? []),
    ].filter(
      (t): t is WorkspaceTab & { path: string } =>
        t.kind === "file" && !!t.path,
    );
    for (const tab of fileTabs) {
      try {
        const content = await api.readFileText(id, tab.path);
        set((s) => ({
          openFiles: s.openFiles.some((f) => f.path === tab.path)
            ? s.openFiles
            : [
                ...s.openFiles,
                { path: tab.path, name: tab.label, content, dirty: false },
              ],
        }));
      } catch {
        get().closeTab(tab.id);
      }
    }
  },

  openProjectBoard: async (projectRoot) => {
    const id = await api.openProjectChat(projectRoot);
    if (!getConversations().some((c) => c.id === id)) {
      await refreshConversations();
    }
    await get().openConversation(id);
  },

  // Shows a new thread for `projectRoot` — nothing is created for it (see
  // `NewThreadDraft`). Its backend/model choice and permission mode start
  // from that project's most-recently-used conversation (if any), so a new
  // thread in a project you've already talked to starts from the same
  // settings instead of the app's global default. Set before
  // `ChatPanel`/`useChatSession` mount and read it via their lazy
  // `useState` initializers.
  startNewConversation: async (projectRoot) => {
    const prior = [...getConversations()]
      .filter((c) => c.projectRoot === projectRoot)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const draft: NewThreadDraft = {
      projectRoot,
      worktreePath: null,
      selection: prior ? (get().conversationBackend[prior.id] ?? null) : null,
      permissionMode: prior ? (get().permissionMode[prior.id] ?? null) : null,
    };

    const token = ++latestSwitchToken;
    const projectId = await api.setProjectRoot(projectRoot);
    await api.setViewRoot(projectRoot);
    // See `openConversation`'s identical guard — a newer switch already won.
    if (token !== latestSwitchToken) return;

    const prevSessionId = get().activeSessionId;
    const prevPanelTabs = get().panelTabs;
    const prevActivePanelTabId = get().activePanelTabId;
    const prevChatTabs = get().chatTabs;
    const prevActiveChatTabId = get().activeChatTabId;

    set((s) => {
      const panelStateByConversation = { ...s.panelStateByConversation };
      const chatStateByConversation = { ...s.chatStateByConversation };
      if (prevSessionId) {
        panelStateByConversation[prevSessionId] = {
          panelTabs: prevPanelTabs,
          activePanelTabId: prevActivePanelTabId,
        };
        chatStateByConversation[prevSessionId] = {
          chatTabs: prevChatTabs,
          activeChatTabId: prevActiveChatTabId,
        };
      }
      return {
        projectRoot,
        projectId,
        activeSessionId: null,
        draft,
        viewEpoch: s.viewEpoch + 1,
        openFiles: [],
        activePath: null,
        panelTabs: [],
        activePanelTabId: null,
        panelStateByConversation,
        chatTabs: [PRIMARY_CHAT_TAB],
        activeChatTabId: "primary",
        chatStateByConversation,
      };
    });
  },

  setDraftSelection: (selection) =>
    set((s) => (s.draft ? { draft: { ...s.draft, selection } } : s)),

  setDraftPermissionMode: (permissionMode) =>
    set((s) => (s.draft ? { draft: { ...s.draft, permissionMode } } : s)),

  setDraftWorktree: (worktreePath) =>
    set((s) => (s.draft ? { draft: { ...s.draft, worktreePath } } : s)),

  promoteDraft: () => {
    const { draft } = get();
    if (!draft) return null;
    const id = crypto.randomUUID();
    set((s) => ({
      activeSessionId: id,
      draft: null,
      conversationBackend: draft.selection
        ? { ...s.conversationBackend, [id]: draft.selection }
        : s.conversationBackend,
      permissionMode: draft.permissionMode
        ? { ...s.permissionMode, [id]: draft.permissionMode }
        : s.permissionMode,
    }));
    get().markConversationStarted(id, draft.projectRoot, draft.worktreePath);
    return id;
  },

  // Optimistic insert the moment a new thread's first message is actually
  // sent (via `promoteDraft`, before the backend round trip) — this is what
  // lists it in the sidebar without waiting on anything async. No-op if
  // already present.
  markConversationStarted: (id, projectRoot, worktreePath = null) => {
    const alreadyListed = getConversations().some((c) => c.id === id);
    if (!alreadyListed) {
      const { projectRoot: currentRoot, projectId: currentProjectId } = get();
      insertConversation({
        id,
        projectRoot,
        // Mirrors what the backend stamps this row with (see
        // `db::upsert_conversation`'s `ensure_project_connection`) —
        // the id of the project this thread was started in, which is
        // the open one. Left null (until the next
        // `loadAllConversations` reconciles it) in the unexpected case
        // where it isn't, rather than guessing a wrong id.
        projectId: currentRoot === projectRoot ? currentProjectId : null,
        title: null,
        updatedAt: nowSeconds(),
        done: false,
        // Not yet known — this placeholder row is only for the sidebar
        // list; `conversationBackend`/`permissionMode` (seeded from the
        // draft by `promoteDraft`) are what everything else actually reads.
        backend: null,
        model: null,
        effort: null,
        agentMode: null,
        permissionMode: null,
        role: null,
        taskId: null,
        taskNumber: null,
        worktreePath,
      });
      set((s) => ({
        checkoutPathBySession: {
          ...s.checkoutPathBySession,
          [id]: worktreePath ?? projectRoot,
        },
      }));
    }
    // Catches any tabs opened while this was still a new thread —
    // `persistActiveSessionTabState` skipped them until now, since there
    // was no id to save them under.
    get().persistActiveSessionTabState();
    // This conversation just became real — persist the picks it carried
    // over from its draft. Only on the transition itself: an
    // already-listed conversation is a no-op above.
    if (!alreadyListed) {
      const backend = get().conversationBackend[id];
      if (backend) get().setConversationBackend(id, backend);
      const mode = get().permissionMode[id];
      if (mode) get().setPermissionMode(id, mode);
    }
  },

  touchConversationActivity: (id) =>
    patchConversation(id, (c) => ({ ...c, updatedAt: nowSeconds() })),

  setConversationTitle: (id, title) =>
    patchConversation(id, (c) => ({ ...c, title })),

  // Optimistic, then round-trips to the backend (unlike title, which the
  // backend derives itself). Rolled back if the write fails, rather than
  // leaving the sidebar showing a state that was never saved.
  setConversationDone: async (id, done) => {
    const before = getConversations().find((c) => c.id === id)?.done;
    patchConversation(id, (c) => ({ ...c, done }));
    try {
      await api.setConversationDone(id, done);
    } catch (e) {
      if (before !== undefined) {
        patchConversation(id, (c) => ({ ...c, done: before }));
      }
      throw e;
    }
  },

  // Removes a conversation for good — the backend cascades its own
  // messages/title/backend/permission-mode/ACP-session rows *and* every
  // sub-agent it spawned (sub-agents are scoped to whichever conversation
  // spawned them — see `db::delete_conversation`'s doc comment). This
  // mirrors that on the frontend: drops the now-stale in-memory entries in
  // `conversationBackend`/`permissionMode` and panel-/chat-tab state (both
  // in-memory and its disk-persisted entry) this id will never use again,
  // its chat draft, and any sub-agent bookkeeping (cached list/
  // `subAgentThreads`/their
  // `chatTabs`) via the same `clearSubAgentTasksForParent` action `/clear`
  // already uses.
  deleteConversation: async (id) => {
    const conversation = getConversations().find((c) => c.id === id);
    await api.deleteConversation(id);
    get().clearSubAgentTasksForParent(id);
    get().forgetConversationBackend(id);
    get().forgetPermissionMode(id);
    get().forgetConversationPanelState(id);
    try {
      localStorage.removeItem(chatDraftKey(id));
    } catch {
      // Best-effort, same as the draft read/write sites in ChatPanel.tsx.
    }
    removeConversation(id);
    set((s) => {
      const checkoutPathBySession = { ...s.checkoutPathBySession };
      delete checkoutPathBySession[id];
      return { checkoutPathBySession };
    });
    if (get().activeSessionId === id && conversation) {
      await get().startNewConversation(conversation.projectRoot);
    }
  },
});
