import type { StateCreator } from "zustand";
import type { Entry } from "../lib/chatEntries";
import { api } from "../lib/tauriApi";
import type { AppStore } from "./index";

export interface SubAgentTask {
  subSessionId: string;
  parentSessionId: string;
  description: string;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt?: number;
}

export interface SubAgentSlice {
  subAgentTasks: SubAgentTask[];
  // Bumped every time `clearSubAgentTasksForParent` runs. Lets an in-flight
  // `loadSubAgentTasks()` fetch (started before the clear) detect that its
  // result is now stale and must not merge stale rows back in — see
  // `loadSubAgentTasks`.
  subAgentTasksEpoch: number;
  subAgentThreads: Record<string, Entry[]>;
  startSubAgentTask: (task: {
    subSessionId: string;
    parentSessionId: string;
    description: string;
  }) => void;
  finishSubAgentTask: (subSessionId: string, status: "done" | "error") => void;
  // Drops every sub-agent spawned by `parentSessionId` from local state —
  // called alongside `/clear` (`ChatPanel.tsx`), since `chat::
  // clear_conversation` now deletes their rows on the backend too
  // (`db::clear_conversation`) rather than leaving them as orphaned rows a
  // cleared conversation can no longer reach. Also closes any of their open
  // `chatTabs` (a stale tab pointing at a just-deleted transcript would
  // 404 the next time `load_conversation_history` runs for it) and drops
  // their live `subAgentThreads`.
  clearSubAgentTasksForParent: (parentSessionId: string) => void;
  // Removes a single finished sub-agent (Sub Agents tab's delete button —
  // see `SubAgentsTab.tsx`), both on the backend (`db::delete_sub_agent`)
  // and from local state/tabs, the same bookkeeping
  // `clearSubAgentTasksForParent` does for a whole parent's worth at once.
  deleteSubAgentTask: (subSessionId: string) => Promise<void>;
  // Backend is the source of truth (SQLite, kept indefinitely) — this merges
  // in anything not already known locally, without clobbering live updates
  // a `subtask_start`/`done`/`error` event may have already applied. Safe
  // to call repeatedly (e.g. on every mount of `SubAgentsTab`/`App`). Discards
  // its result if `clearSubAgentTasksForParent` ran while the fetch was in
  // flight, so a stale read can't resurrect rows a `/clear` just removed.
  loadSubAgentTasks: () => Promise<void>;
  setSubAgentEntries: (
    subSessionId: string,
    updater: (prev: Entry[]) => Entry[],
  ) => void;
}

export const subAgentSlice: StateCreator<AppStore, [], [], SubAgentSlice> = (
  set,
  get,
) => ({
  subAgentTasks: [],
  subAgentTasksEpoch: 0,
  subAgentThreads: {},

  startSubAgentTask: ({ subSessionId, parentSessionId, description }) =>
    set((s) => ({
      subAgentTasks: [
        ...s.subAgentTasks,
        {
          subSessionId,
          parentSessionId,
          description,
          status: "running",
          startedAt: Date.now(),
        },
      ],
    })),

  loadSubAgentTasks: async () => {
    const epochAtStart = get().subAgentTasksEpoch;
    const rows = await api.listSubAgents();
    set((s) => {
      // A `/clear` ran while this fetch was in flight — `rows` reflects a
      // pre-clear snapshot, so merging it back in would resurrect entries
      // `clearSubAgentTasksForParent` just removed. Drop it.
      if (s.subAgentTasksEpoch !== epochAtStart) return s;
      const known = new Set(s.subAgentTasks.map((t) => t.subSessionId));
      const fromDb: SubAgentTask[] = rows
        .filter((r) => !known.has(r.id))
        .map((r) => ({
          subSessionId: r.id,
          parentSessionId: r.parentSessionId,
          description: r.description,
          status: r.status,
          startedAt: r.startedAt * 1000,
          endedAt: r.finishedAt ? r.finishedAt * 1000 : undefined,
        }));
      return fromDb.length
        ? { subAgentTasks: [...s.subAgentTasks, ...fromDb] }
        : s;
    });
  },

  finishSubAgentTask: (subSessionId, status) =>
    set((s) => ({
      subAgentTasks: s.subAgentTasks.map((t) =>
        t.subSessionId === subSessionId
          ? { ...t, status, endedAt: Date.now() }
          : t,
      ),
    })),

  clearSubAgentTasksForParent: (parentSessionId) =>
    set((s) => {
      const removedIds = new Set(
        s.subAgentTasks
          .filter((t) => t.parentSessionId === parentSessionId)
          .map((t) => t.subSessionId),
      );
      // Always bump the epoch, even with nothing locally known to remove yet:
      // an initial `loadSubAgentTasks()` fetch may still be in flight and
      // would otherwise merge in this parent's now-deleted rows once it
      // resolves (see `loadSubAgentTasks`).
      if (removedIds.size === 0)
        return { subAgentTasksEpoch: s.subAgentTasksEpoch + 1 };

      const subAgentTasks = s.subAgentTasks.filter(
        (t) => !removedIds.has(t.subSessionId),
      );
      const subAgentThreads = Object.fromEntries(
        Object.entries(s.subAgentThreads).filter(([id]) => !removedIds.has(id)),
      );
      const chatTabs = s.chatTabs.filter(
        (t) => t.kind !== "subagent" || !removedIds.has(t.subSessionId),
      );
      const activeChatTabId = chatTabs.some((t) => t.id === s.activeChatTabId)
        ? s.activeChatTabId
        : "primary";
      return {
        subAgentTasks,
        subAgentThreads,
        chatTabs,
        activeChatTabId,
        subAgentTasksEpoch: s.subAgentTasksEpoch + 1,
      };
    }),

  deleteSubAgentTask: async (subSessionId) => {
    await api.deleteSubAgent(subSessionId);
    set((s) => {
      const chatTabs = s.chatTabs.filter(
        (t) => t.kind !== "subagent" || t.subSessionId !== subSessionId,
      );
      const activeChatTabId = chatTabs.some((t) => t.id === s.activeChatTabId)
        ? s.activeChatTabId
        : "primary";
      const subAgentThreads = { ...s.subAgentThreads };
      delete subAgentThreads[subSessionId];
      return {
        subAgentTasks: s.subAgentTasks.filter(
          (t) => t.subSessionId !== subSessionId,
        ),
        subAgentThreads,
        chatTabs,
        activeChatTabId,
        // Guards against a `loadSubAgentTasks()` fetch that was already in
        // flight from re-adding this id once it resolves with stale data —
        // same reasoning as `clearSubAgentTasksForParent`.
        subAgentTasksEpoch: s.subAgentTasksEpoch + 1,
      };
    });
  },

  setSubAgentEntries: (subSessionId, updater) =>
    set((s) => ({
      subAgentThreads: {
        ...s.subAgentThreads,
        [subSessionId]: updater(s.subAgentThreads[subSessionId] ?? []),
      },
    })),
});
