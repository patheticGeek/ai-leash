import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import { api, type SubAgentSummary } from "../lib/tauriApi";
import { useTauriEvent } from "../lib/useTauriEvent";
import { qk } from "./keys";

// One sub-agent as the UI uses it — the backend's `SubAgentSummary` with
// millisecond timestamps (the elapsed-time displays compare against
// `Date.now()`) and the field names the Sub Agents tab has always used.
export interface SubAgentTask {
  subSessionId: string;
  parentSessionId: string;
  description: string;
  status: SubAgentSummary["status"];
  startedAt: number;
  endedAt?: number;
  model: string;
  effort?: string;
}

function toTask(r: SubAgentSummary): SubAgentTask {
  return {
    subSessionId: r.id,
    parentSessionId: r.parentSessionId,
    description: r.description,
    status: r.status,
    startedAt: r.startedAt * 1000,
    endedAt: r.finishedAt ? r.finishedAt * 1000 : undefined,
    model: r.model,
    effort: r.effort ?? undefined,
  };
}

async function listSubAgents(ownerId: string): Promise<SubAgentTask[]> {
  return (await api.listSubAgents(ownerId)).map(toTask);
}

const NONE: SubAgentTask[] = [];

// Every sub-agent `ownerId` spawned, newest first — the Sub Agents tab and
// every running-count badge read this. Kept live by `useSubAgentsListener`
// (mounted once in `App.tsx`), never by per-sub-agent listeners.
export function useSubAgents(ownerId: string | null): SubAgentTask[] {
  const { data } = useQuery({
    queryKey: qk.subAgents(ownerId ?? ""),
    queryFn: () => listSubAgents(ownerId ?? ""),
    enabled: !!ownerId,
  });
  return data ?? NONE;
}

export function getSubAgents(ownerId: string): SubAgentTask[] {
  return queryClient.getQueryData<SubAgentTask[]>(qk.subAgents(ownerId)) ?? [];
}

export function setSubAgents(
  ownerId: string,
  updater: (prev: SubAgentTask[]) => SubAgentTask[],
): void {
  queryClient.setQueryData<SubAgentTask[]>(qk.subAgents(ownerId), (old) =>
    updater(old ?? []),
  );
}

// Both events carry ids in their payload, so one always-mounted listener
// each covers every conversation — see `useGeneratingListener`'s doc comment
// (`generatingQuery.ts`) for why that beats listening per sub-agent (the
// cause of the two sub-agent status races fixed before this query existed).
// `agent://lifecycle` fires when a sub-agent starts and when it finishes;
// clearing or deleting a conversation also drops everything it spawned.
export function useSubAgentsListener() {
  useTauriEvent<{ conversationId: string; ownerId: string; lifecycle: string }>(
    "agent://lifecycle",
    (payload) => {
      void queryClient.invalidateQueries({
        queryKey: qk.subAgents(payload.ownerId),
      });
    },
  );
  useTauriEvent<{ conversationId: string; reason: string }>(
    "conversation://changed",
    (payload) => {
      if (payload.reason !== "cleared" && payload.reason !== "deleted") return;
      void queryClient.invalidateQueries({
        queryKey: qk.subAgents(payload.conversationId),
      });
    },
  );
}
