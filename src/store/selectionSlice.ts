import type { StateCreator } from "zustand";
import { getConversations } from "../data/conversations";
import { LS_KEYS } from "../lib/localStorageKeys";
import { api } from "../lib/tauriApi";
import type { ConversationSummary } from "./conversationSlice";
import type { AppStore } from "./index";
import { localStorageJson } from "./localStorageJson";

// Which backend a conversation talks to, and its own model/effort choice
// there. `backendId` is a registry id (`data/backends.ts`); `model` is an
// Ollama model name, a free-text OpenAI-compatible model id, or an ACP
// agent's own model value ("" = the backend's default); `effort` and
// `agentMode` (the agent's own permission mode, e.g. "acceptEdits") are only
// used by an ACP agent that offers them.
export interface ConversationBackendSelection {
  backendId: string;
  model: string;
  effort: string | null;
  agentMode: string | null;
}

// The pre-DB `LS_KEYS.conversationBackend` blob held one of these per
// conversation — only read once, to migrate a row that has no `backend` yet.
function fromLegacyEntry(value: unknown): ConversationBackendSelection | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x : "");
  if (v.kind === "acp" && str(v.acpActiveId)) {
    return {
      backendId: str(v.acpActiveId),
      model: str(v.acpModel),
      effort: str(v.acpEffort) || null,
      agentMode: null,
    };
  }
  if (v.kind === "builtin" && str(v.providerActiveId)) {
    return {
      backendId: str(v.providerActiveId),
      model: str(v.model),
      effort: null,
      agentMode: null,
    };
  }
  return null;
}

export interface SelectionSlice {
  // Per-conversation backend choice, keyed by session id. Mirrors the
  // conversation row's `backend`/`model`/`effort`/`agent_mode` columns, plus entries for
  // new, still-unsent threads (which have no row yet).
  conversationBackend: Record<string, ConversationBackendSelection>;
  setConversationBackend: (
    sessionId: string,
    selection: ConversationBackendSelection,
  ) => void;
  // Drops a deleted conversation's entry — Rust already dropped the row.
  forgetConversationBackend: (sessionId: string) => void;
  // Seeds `conversationBackend` from freshly loaded rows — called once from
  // `conversationSlice.loadAllConversations`. A row without a `backend` yet
  // falls back to the old localStorage blob once, and the blob is removed.
  hydrateConversationBackendFromRows: (rows: ConversationSummary[]) => void;
}

export const selectionSlice: StateCreator<AppStore, [], [], SelectionSlice> = (
  set,
  get,
) => ({
  conversationBackend: {},

  setConversationBackend: (sessionId, selection) => {
    set((s) => ({
      conversationBackend: { ...s.conversationBackend, [sessionId]: selection },
    }));
    // Only persist once this is a real, listed conversation —
    // `useChatSession.ts` re-runs this on every backend/model change,
    // including for a still-unsent "new thread", and that must not leave a
    // row behind just from opening the model picker.
    // `conversationSlice.markConversationStarted` flushes the entry once the
    // thread becomes real.
    const listed = getConversations().find((c) => c.id === sessionId);
    if (!listed || !selection.backendId) return;
    void api.setConversationBackend(
      sessionId,
      listed.projectRoot,
      selection.backendId,
      selection.model || null,
      selection.effort,
      selection.agentMode,
    );
  },

  forgetConversationBackend: (sessionId) =>
    set((s) => {
      if (!(sessionId in s.conversationBackend)) return s;
      const conversationBackend = { ...s.conversationBackend };
      delete conversationBackend[sessionId];
      return { conversationBackend };
    }),

  hydrateConversationBackendFromRows: (rows) => {
    const legacy = localStorageJson.read<Record<string, unknown>>(
      LS_KEYS.conversationBackend,
      {},
    );
    const hasLegacy =
      legacy && typeof legacy === "object" && Object.keys(legacy).length > 0;
    for (const row of rows) {
      if (get().conversationBackend[row.id]) continue;
      if (row.backend) {
        const selection = {
          backendId: row.backend,
          model: row.model ?? "",
          effort: row.effort,
          agentMode: row.agentMode,
        };
        set((s) => ({
          conversationBackend: {
            ...s.conversationBackend,
            [row.id]: selection,
          },
        }));
        continue;
      }
      if (!hasLegacy) continue;
      const migrated = fromLegacyEntry(legacy[row.id]);
      if (migrated) get().setConversationBackend(row.id, migrated);
    }
    if (hasLegacy) localStorage.removeItem(LS_KEYS.conversationBackend);
  },
});
