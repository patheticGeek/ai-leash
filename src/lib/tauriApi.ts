import { invoke } from "@tauri-apps/api/core";

export interface DirEntryInfo {
  name: string;
  path: string;
  isDir: boolean;
}

export interface ModelSummary {
  name: string;
  contextLength: number | null;
}

// Wire shape matching Rust's `provider::ProviderConfig` exactly (see
// provider.rs's `provider_config_serde_matches_frontend_wire_shape` test).
export type ProviderConfigPayload =
  | { kind: "ollama"; host: string }
  | { kind: "openAiCompatible"; baseUrl: string; apiKey: string };

export interface PersistedToolCall {
  id: string | null;
  function: { name: string; arguments: unknown };
}

export interface PersistedMessage {
  role: string;
  content: string;
  toolCalls: PersistedToolCall[] | null;
  createdAt: number;
}

export interface SubAgentSummary {
  id: string;
  parentSessionId: string;
  description: string;
  status: "running" | "done" | "error";
  startedAt: number; // epoch seconds, matches PersistedMessage.createdAt
  finishedAt: number | null;
}

export const api = {
  setProjectRoot: (path: string) => invoke<void>("set_project_root", { path }),
  getProjectRoot: () => invoke<string | null>("get_project_root"),
  listDir: (path?: string) => invoke<DirEntryInfo[]>("list_dir", { path }),
  readFileText: (path: string) => invoke<string>("read_file_text", { path }),
  writeFileText: (path: string, contents: string) =>
    invoke<void>("write_file_text", { path, contents }),
  ptySpawn: (cwd: string | undefined, cols: number, rows: number) =>
    invoke<string>("pty_spawn", { cwd, cols, rows }),
  ptyWrite: (id: string, data: string) => invoke<void>("pty_write", { id, data }),
  ptyResize: (id: string, cols: number, rows: number) =>
    invoke<void>("pty_resize", { id, cols, rows }),
  ptyKill: (id: string) => invoke<void>("pty_kill", { id }),
  listProviderModels: (provider: ProviderConfigPayload) =>
    invoke<ModelSummary[]>("list_provider_models", { provider }),
  checkProviderConnection: (provider: ProviderConfigPayload) =>
    invoke<boolean>("check_provider_connection", { provider }),
  loadConversationHistory: (sessionId: string) =>
    invoke<PersistedMessage[]>("load_conversation_history", { sessionId }),
  sendPrompt: (
    sessionId: string,
    provider: ProviderConfigPayload,
    model: string,
    message: string,
  ) => invoke<void>("send_prompt", { sessionId, provider, model, message }),
  retryLast: (sessionId: string, provider: ProviderConfigPayload, model: string) =>
    invoke<void>("retry_last", { sessionId, provider, model }),
  cancelPrompt: (sessionId: string) => invoke<void>("cancel_prompt", { sessionId }),
  sendPromptAcp: (sessionId: string, launchCommand: string, message: string) =>
    invoke<void>("send_prompt_acp", { sessionId, launchCommand, message }),
  listSubAgents: () => invoke<SubAgentSummary[]>("list_sub_agents"),
};
