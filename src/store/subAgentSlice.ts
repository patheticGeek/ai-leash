import type { StateCreator } from "zustand";
import { qk } from "../data/keys";
import { getSubAgents, setSubAgents } from "../data/subAgents";
import type { Entry } from "../lib/chatEntries";
import { createFrameBatcher } from "../lib/frameBatch";
import { queryClient } from "../lib/queryClient";
import { api } from "../lib/tauriApi";
import type { AppStore } from "./index";
import { withoutTabs } from "./panelSlice";

export type { SubAgentTask } from "../data/subAgents";

// The sub-agent *list* (status, timings, model) is a query now — see
// `data/subAgents.ts`'s `useSubAgents(ownerId)`. What stays here is only
// the live, per-frame part: each sub-agent's streamed transcript while it
// runs, plus the cleanup that goes with removing one.
export interface SubAgentSlice {
  subAgentThreads: Record<string, Entry[]>;
  // Drops every sub-agent spawned by `parentSessionId` from the frontend —
  // called alongside `/clear` (`ChatPanel.tsx`) and a conversation delete,
  // since the backend deletes their rows too. Empties the cached list right
  // away (the `conversation://changed` refetch confirms it), and when the
  // parent is the open conversation also closes their tabs (a stale
  // tab pointing at a deleted transcript would 404 on its next load) and
  // drops their live `subAgentThreads`.
  clearSubAgentTasksForParent: (parentSessionId: string) => void;
  // Removes a single finished sub-agent (Sub Agents tab's delete button —
  // see `SubAgentsTab.tsx`), on the backend (`db::delete_sub_agent`) and in
  // the cached list, tabs and threads.
  deleteSubAgentTask: (
    parentSessionId: string,
    subSessionId: string,
  ) => Promise<void>;
  setSubAgentEntries: (
    subSessionId: string,
    updater: (prev: Entry[]) => Entry[],
  ) => void;
}

type ThreadUpdate = [subSessionId: string, (prev: Entry[]) => Entry[]];

export const subAgentSlice: StateCreator<AppStore, [], [], SubAgentSlice> = (
  set,
  get,
) => {
  // A sub-agent streams as fast as its parent does — its updates are
  // applied together once per frame, in one `set`, rather than one store
  // update (and re-render of every subscriber) per chunk.
  const pending = createFrameBatcher<ThreadUpdate>((updates) =>
    set((s) => {
      const subAgentThreads = { ...s.subAgentThreads };
      for (const [id, updater] of updates) {
        subAgentThreads[id] = updater(subAgentThreads[id] ?? []);
      }
      return { subAgentThreads };
    }),
  );
  // A removed sub-agent's queued updates mustn't bring its thread back.
  const forgetPending = (removed: (id: string) => boolean) =>
    pending.discard(([id]) => !removed(id));

  return {
    subAgentThreads: {},

    clearSubAgentTasksForParent: (parentSessionId) => {
      const ownsOpenTabs = get().activeSessionId === parentSessionId;
      const removedIds = new Set(
        getSubAgents(parentSessionId).map((t) => t.subSessionId),
      );
      if (ownsOpenTabs) {
        for (const t of [...get().chatTabs, ...get().panelTabs]) {
          if (t.kind === "subagent" && t.subSessionId) {
            removedIds.add(t.subSessionId);
          }
        }
      }
      setSubAgents(parentSessionId, () => []);
      if (removedIds.size === 0) return;
      forgetPending((id) => removedIds.has(id));
      set((s) => {
        const subAgentThreads = Object.fromEntries(
          Object.entries(s.subAgentThreads).filter(
            ([id]) => !removedIds.has(id),
          ),
        );
        if (!ownsOpenTabs) return { subAgentThreads };
        return {
          subAgentThreads,
          ...withoutTabs(
            s,
            (t) =>
              t.kind === "subagent" &&
              !!t.subSessionId &&
              removedIds.has(t.subSessionId),
          ),
        };
      });
      if (ownsOpenTabs) get().persistActiveSessionTabState();
    },

    deleteSubAgentTask: async (parentSessionId, subSessionId) => {
      await api.deleteSubAgent(subSessionId);
      setSubAgents(parentSessionId, (prev) =>
        prev.filter((t) => t.subSessionId !== subSessionId),
      );
      void queryClient.invalidateQueries({
        queryKey: qk.subAgents(parentSessionId),
      });
      forgetPending((id) => id === subSessionId);
      set((s) => {
        const subAgentThreads = { ...s.subAgentThreads };
        delete subAgentThreads[subSessionId];
        return {
          subAgentThreads,
          ...withoutTabs(
            s,
            (t) => t.kind === "subagent" && t.subSessionId === subSessionId,
          ),
        };
      });
      get().persistActiveSessionTabState();
    },

    setSubAgentEntries: (subSessionId, updater) =>
      pending.push([subSessionId, updater]),
  };
};
