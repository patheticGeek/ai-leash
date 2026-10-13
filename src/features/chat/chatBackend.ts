import {
  BACKEND_CAPABILITIES,
  type BackendCapabilities,
  type BackendKind,
} from "../../data/backends";
import { api, type ProviderConfigPayload } from "../../lib/tauriApi";

// Whoever answers this conversation, as one object: what it can do (`caps`)
// and how to talk to it. Built by `useChatSession`; the chat panel, composer
// and transcript call these instead of branching on Ollama vs
// OpenAI-compatible vs ACP — the frontend counterpart of Rust's `Backend`
// trait. `createChatBackend` below is the only place the kinds differ.
export interface ChatBackend {
  kind: BackendKind;
  caps: BackendCapabilities;
  // Everything needed to send is picked (a model, or an ACP agent) and the
  // backend isn't switched off in Settings.
  ready: boolean;
  send(sessionId: string, message: string): Promise<void>;
  // Only when `caps.retry`.
  retry(sessionId: string): Promise<void>;
  // Only when `caps.compaction`; resolves to the summary.
  compact(sessionId: string): Promise<string>;
  // Only when `caps.warmup`.
  warm(sessionId: string): Promise<void>;
}

export interface ChatBackendInput {
  kind: BackendKind;
  model: string;
  // The native provider and model. An ACP turn carries them too: they're
  // what a sub-agent the ACP agent spawns runs on.
  provider: ProviderConfigPayload;
  // The ACP agent's launch command; unset for a native provider.
  launchCommand?: string;
  // Switched off in Settings > Agents after being picked.
  disabled: boolean;
}

function unsupported(kind: BackendKind, what: string): () => Promise<never> {
  return () =>
    Promise.reject(new Error(`${kind} backends don't support ${what}`));
}

export function createChatBackend({
  kind,
  model,
  provider,
  launchCommand,
  disabled,
}: ChatBackendInput): ChatBackend {
  const caps = BACKEND_CAPABILITIES[kind];
  switch (kind) {
    case "acp":
      return {
        kind,
        caps,
        ready: !disabled && !!launchCommand,
        send: (sessionId, message) =>
          api.sendPromptAcp(
            sessionId,
            launchCommand ?? "",
            provider,
            model,
            message,
          ),
        warm: (sessionId) =>
          api.warmAcpSession(sessionId, launchCommand ?? "", provider, model),
        retry: unsupported(kind, "retry"),
        compact: unsupported(kind, "/compact"),
      };
    case "ollama":
    case "openAiCompatible":
      return {
        kind,
        caps,
        ready: !disabled && !!model,
        send: (sessionId, message) =>
          api.sendPrompt(sessionId, provider, model, message),
        retry: (sessionId) => api.retryLast(sessionId, provider, model),
        compact: (sessionId) =>
          api.compactConversation(sessionId, provider, model),
        warm: unsupported(kind, "warm-up"),
      };
  }
}
