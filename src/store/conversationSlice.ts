import type { StateCreator } from "zustand";
import { chatDraftKey } from "../lib/chatDraft";
import { api } from "../lib/tauriApi";
import type { AppStore } from "./index";
import type { PanelTab } from "./panelSlice";
import { PRIMARY_CHAT_TAB } from "./panelSlice";

export interface ConversationSummary {
  id: string;
  projectRoot: string;
  title: string | null;
  updatedAt: number; // epoch seconds, matches the backend's `ConversationSummary`
  // Sidebar organization only — see `setConversationDone`. Marked done
  // conversations sort to their own collapsed section at the bottom of
  // `LeftBar` instead of the main list.
  done: boolean;
  // Non-null only when this conversation runs in a worktree instead of the
  // project's primary checkout — see `BranchBar`. Never a branch name: what's
  // checked out there can change outside the app, so the frontend always
  // reads it live (`api.watchGitBranch`) instead of trusting a stored value.
  worktreePath: string | null;
}

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
  // Every top-level conversation across every known project — the
  // sidebar's own scope (`LeftBar.tsx`), loaded once at startup via
  // `loadAllConversations` and kept in sync incrementally from then on
  // (`markConversationStarted`/`touchConversationActivity`/
  // `setConversationTitle`) rather than re-fetched on every change.
  conversations: ConversationSummary[];
  // The conversation currently shown in the center pane. Minted up front
  // the moment a project is picked (`startNewConversation`/
  // `openConversation`/`initializeStartupSession`) rather than deferred to
  // first send, so `App.tsx`'s `key={activeSessionId}` remount boundary
  // never has to fire mid-turn — see `conversationSlice.ts`'s module doc.
  // Only null before any project has ever been known.
  activeSessionId: string | null;
  loadAllConversations: () => Promise<void>;
  initializeStartupSession: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  startNewConversation: (projectRoot: string) => Promise<void>;
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
  conversations: [],
  activeSessionId: null,

  // Backend is the source of truth (SQLite, kept indefinitely) — this
  // merges in anything not already known locally, without clobbering a
  // conversation `markConversationStarted` already optimistically inserted
  // ahead of its own first `save_message` landing (same non-destructive
  // merge as `subAgentSlice.loadSubAgentTasks`).
  loadAllConversations: async () => {
    const rows = await api.listConversations();
    set((s) => {
      const known = new Set(s.conversations.map((c) => c.id));
      const fresh = rows.filter((r) => !known.has(r.id));
      return fresh.length
        ? { conversations: [...s.conversations, ...fresh] }
        : s;
    });
  },

  // Runs once at app startup in place of the old `restoreLastProject` —
  // sets up the last-used project as a fresh "new thread" (so the title
  // bar can show "{project} / new thread" and file tools work if a
  // message is sent) without selecting any real, listed conversation.
  initializeStartupSession: async () => {
    await get().loadAllConversations();
    const { conversations, recentProjects } = get();
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
    const conversation = get().conversations.find((c) => c.id === id);
    if (!conversation) return;
    const { projectRoot } = conversation;
    const token = ++latestSwitchToken;
    await api.setProjectRoot(projectRoot);
    // Restores this conversation's own checkout (primary or worktree) —
    // separate from the global `project_root` above, which only drives the
    // file tree / terminal's "focused" project. See `BranchBar`.
    await api.setConversationRoot(
      id,
      projectRoot,
      conversation.worktreePath ?? projectRoot,
    );
    // A newer switch (another click, or `startNewConversation`) started
    // while this one was awaiting the backend round trip — let it win
    // instead of overwriting whatever it already committed.
    if (token !== latestSwitchToken) return;

    // Read fresh, not before the `await` above — otherwise this could be
    // stamping a panel-state snapshot for a `prevSessionId` that's already
    // stale by the time it's actually written.
    const prevSessionId = get().activeSessionId;
    const prevPanelTabs = get().panelTabs;
    const prevActivePanelTabId = get().activePanelTabId;

    const restored = get().panelStateByConversation[id];
    const restoredActiveTab = restored?.panelTabs.find(
      (t) => t.id === restored.activePanelTabId,
    );

    set((s) => {
      const panelStateByConversation = { ...s.panelStateByConversation };
      if (prevSessionId) {
        panelStateByConversation[prevSessionId] = {
          panelTabs: prevPanelTabs,
          activePanelTabId: prevActivePanelTabId,
        };
      }
      return {
        projectRoot,
        activeSessionId: id,
        openFiles: [],
        activePath:
          restoredActiveTab?.kind === "file"
            ? (restoredActiveTab.path ?? null)
            : null,
        panelTabs: restored?.panelTabs ?? [],
        activePanelTabId: restored?.activePanelTabId ?? null,
        panelStateByConversation,
        chatTabs: [PRIMARY_CHAT_TAB],
        activeChatTabId: "primary",
      };
    });

    const fileTabs = (restored?.panelTabs ?? []).filter(
      (t): t is PanelTab & { path: string } => t.kind === "file" && !!t.path,
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
        get().closePanelTab(tab.id);
      }
    }
  },

  // Mints a brand new conversation id up front for `projectRoot` — before
  // it becomes `activeSessionId`, seeds its backend/model choice and
  // permission mode from that project's most-recently-used conversation
  // (if any), so a new conversation for a project you've already talked to
  // starts from the same settings instead of the app's global default.
  // This must happen before `ChatPanel`/`useChatSession` mount and read
  // those maps via their lazy `useState` initializers.
  startNewConversation: async (projectRoot) => {
    const id = crypto.randomUUID();
    const prior = [...get().conversations]
      .filter((c) => c.projectRoot === projectRoot)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (prior) {
      const backend = get().conversationBackend[prior.id];
      if (backend) get().setConversationBackend(id, backend);
      const mode = get().permissionMode[prior.id];
      if (mode) get().setPermissionMode(id, mode);
    }

    const token = ++latestSwitchToken;
    await api.setProjectRoot(projectRoot);
    // Locks in the primary checkout as this conversation's default cwd
    // right away — before `ChatPanel`/`BranchBar` even mount — so an ACP
    // subprocess warmed ahead of any worktree choice never starts against
    // the wrong directory. `BranchBar` overwrites this if the user picks a
    // worktree before sending the first message.
    await api.setConversationRoot(id, projectRoot, projectRoot);
    // See `openConversation`'s identical guard — a newer switch already won.
    if (token !== latestSwitchToken) return;

    const prevSessionId = get().activeSessionId;
    const prevPanelTabs = get().panelTabs;
    const prevActivePanelTabId = get().activePanelTabId;

    set((s) => {
      const panelStateByConversation = { ...s.panelStateByConversation };
      if (prevSessionId) {
        panelStateByConversation[prevSessionId] = {
          panelTabs: prevPanelTabs,
          activePanelTabId: prevActivePanelTabId,
        };
      }
      return {
        projectRoot,
        activeSessionId: id,
        openFiles: [],
        activePath: null,
        panelTabs: [],
        activePanelTabId: null,
        panelStateByConversation,
        chatTabs: [PRIMARY_CHAT_TAB],
        activeChatTabId: "primary",
      };
    });
  },

  // Optimistic insert the moment a new conversation's first message is
  // actually sent (called from `ChatPanel.submitPrompt`, before the
  // backend round trip) — this is what flips a conversation from "new
  // thread" to a real, listed row in the sidebar without waiting on
  // anything async. No-op if already present (e.g. a second message in the
  // same still-fresh conversation).
  markConversationStarted: (id, projectRoot, worktreePath = null) =>
    set((s) =>
      s.conversations.some((c) => c.id === id)
        ? s
        : {
            conversations: [
              {
                id,
                projectRoot,
                title: null,
                updatedAt: nowSeconds(),
                done: false,
                worktreePath,
              },
              ...s.conversations,
            ],
          },
    ),

  touchConversationActivity: (id) =>
    set((s) => {
      if (!s.conversations.some((c) => c.id === id)) return s;
      return {
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, updatedAt: nowSeconds() } : c,
        ),
      };
    }),

  setConversationTitle: (id, title) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c,
      ),
    })),

  // Optimistic like `setConversationTitle`, but round-trips to the backend
  // (unlike title, which the backend derives itself) since "done" has no
  // other source of truth to reconcile against on the next
  // `loadAllConversations`.
  setConversationDone: async (id, done) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, done } : c,
      ),
    }));
    await api.setConversationDone(id, done);
  },

  // Removes a conversation for good — the backend cascades its own
  // messages/title/ACP-session rows *and* every sub-agent it spawned (sub-
  // agents are scoped to whichever conversation spawned them — see
  // `db::delete_conversation`'s doc comment). This mirrors that on the
  // frontend: drops the localStorage-backed settings (`conversationBackend`/
  // `permissionMode`) and panel-state snapshot this id will never use again,
  // its chat draft, and any sub-agent bookkeeping (`subAgentTasks`/
  // `subAgentThreads`/their `chatTabs`) via the same `clearSubAgentTasksForParent`
  // action `/clear` already uses.
  deleteConversation: async (id) => {
    const conversation = get().conversations.find((c) => c.id === id);
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
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
    }));
    if (get().activeSessionId === id && conversation) {
      await get().startNewConversation(conversation.projectRoot);
    }
  },
});
