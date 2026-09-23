import type { StateCreator } from "zustand";
import { qk } from "../data/keys";
import { getSubAgents, setSubAgents } from "../data/subAgents";
import type { Entry } from "../lib/chatEntries";
import { queryClient } from "../lib/queryClient";
import { api } from "../lib/tauriApi";
import type { AppStore } from "./index";

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
  // parent is the open conversation also closes their `chatTabs` (a stale
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

export const subAgentSlice: StateCreator<AppStore, [], [], SubAgentSlice> = (
  set,
  get,
) => ({
  subAgentThreads: {},

  clearSubAgentTasksForParent: (parentSessionId) => {
    const ownsOpenTabs = get().activeSessionId === parentSessionId;
    const removedIds = new Set(
      getSubAgents(parentSessionId).map((t) => t.subSessionId),
    );
    if (ownsOpenTabs) {
      for (const t of get().chatTabs) {
        if (t.kind === "subagent") removedIds.add(t.subSessionId);
      }
    }
    setSubAgents(parentSessionId, () => []);
    if (removedIds.size === 0) return;
    set((s) => {
      const subAgentThreads = Object.fromEntries(
        Object.entries(s.subAgentThreads).filter(([id]) => !removedIds.has(id)),
      );
      if (!ownsOpenTabs) return { subAgentThreads };
      const chatTabs = s.chatTabs.filter(
        (t) => t.kind !== "subagent" || !removedIds.has(t.subSessionId),
      );
      const activeChatTabId = chatTabs.some((t) => t.id === s.activeChatTabId)
        ? s.activeChatTabId
        : "primary";
      return { subAgentThreads, chatTabs, activeChatTabId };
    });
  },

  deleteSubAgentTask: async (parentSessionId, subSessionId) => {
    await api.deleteSubAgent(subSessionId);
    setSubAgents(parentSessionId, (prev) =>
      prev.filter((t) => t.subSessionId !== subSessionId),
    );
    void queryClient.invalidateQueries({
      queryKey: qk.subAgents(parentSessionId),
    });
    set((s) => {
      const chatTabs = s.chatTabs.filter(
        (t) => t.kind !== "subagent" || t.subSessionId !== subSessionId,
      );
      const activeChatTabId = chatTabs.some((t) => t.id === s.activeChatTabId)
        ? s.activeChatTabId
        : "primary";
      const subAgentThreads = { ...s.subAgentThreads };
      delete subAgentThreads[subSessionId];
      return { subAgentThreads, chatTabs, activeChatTabId };
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
