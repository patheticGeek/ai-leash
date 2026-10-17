import {
  BACKEND_CAPABILITIES,
  type BackendCapabilities,
  type BackendKind,
} from "../../data/backends";
import { api, type BackendConfig } from "../../lib/tauriApi";

// Whoever answers this conversation, as one object: what it can do (`caps`)
// and how to talk to it. Built by `useChatSession`; the chat panel, composer
// and transcript call these instead of branching on Ollama vs
// OpenAI-compatible vs ACP — the frontend counterpart of Rust's `Backend`
// trait. Every call names the backend by id and Rust resolves it, so the
// kinds only differ in `caps`.
export interface ChatBackend {
  id: string;
  kind: BackendKind;
  caps: BackendCapabilities;
  // Everything needed to send is picked (a model, unless the backend runs
  // its own loop, and one still offered) and the backend exists and is
  // switched on.
  ready: boolean;
  send(sessionId: string, message: string): Promise<void>;
  // Only when `caps.retry`.
  retry(sessionId: string): Promise<void>;
  // Only when `caps.compaction`; resolves to the summary.
  compact(sessionId: string): Promise<string>;
  // Only when `caps.warmup`.
  warm(sessionId: string): Promise<void>;
}

function unsupported(what: string): () => Promise<never> {
  return () => Promise.reject(new Error(`This agent doesn't support ${what}`));
}

// `config` is undefined when the conversation's backend was deleted in
// Settings; the result is then never `ready`. Nor is it when `modelOffered`
// is false: the picked model has dropped out of the backend's model list.
export function createChatBackend(
  config: BackendConfig | undefined,
  model: string,
  effort: string | null,
  modelOffered = true,
): ChatBackend {
  const kind = config?.kind ?? "ollama";
  const caps = BACKEND_CAPABILITIES[kind];
  const id = config?.id ?? "";
  return {
    id,
    kind,
    caps,
    ready:
      !!config &&
      config.enabled &&
      modelOffered &&
      (caps.ownsAgentLoop || !!model),
    send: (sessionId, message) =>
      api.sendPrompt(sessionId, id, model, effort, message),
    retry: caps.retry
      ? (sessionId) => api.retryLast(sessionId, id, model, effort)
      : unsupported("retry"),
    compact: caps.compaction
      ? (sessionId) => api.compactConversation(sessionId, id, model)
      : unsupported("/compact"),
    warm: caps.warmup
      ? (sessionId) => api.warmSession(sessionId, id)
      : unsupported("warm-up"),
  };
}
