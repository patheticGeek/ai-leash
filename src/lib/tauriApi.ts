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

// Payload of the `chat://{sessionId}/acp_model_options` event, emitted only
// when the connected ACP agent exposes a "model" session config option (see
// docs/features/agent-chat.md) — most agents won't, so this event may never
// fire for a given session.
export interface AcpModelOptions {
  id: string; // the agent's own SessionConfigId, opaque — passed back verbatim to setAcpModel
  name: string;
  currentValue: string;
  options: { value: string; name: string }[];
}

// Payload of the `chat://{sessionId}/acp_commands` event, emitted whenever
// the connected ACP agent (re-)announces its slash commands — typically
// once, right after the session opens, but an agent can send this again if
// its command set changes mid-conversation. `hint` is the agent's
// placeholder text for the command's argument (e.g. "<file>"), null when
// the command takes no input.
export interface AcpCommandInfo {
  name: string;
  description: string;
  hint: string | null;
}

// Payload of the global `permission://request` event — one listener for the
// whole app (see `LeftBar.tsx`), not per-session, since `sessionId` here is
// what routes it to the right project (see `permissionForSession` in
// `store.ts`). `sessionId` is a sub-agent's own synthetic id when the
// request came from one of its tool calls, not its parent's.
export interface PermissionRequestPayload {
  id: string;
  sessionId: string;
  kind: "shell" | "edit" | "acp";
  title: string;
  detail: string;
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
  ptyWrite: (id: string, data: string) =>
    invoke<void>("pty_write", { id, data }),
  ptyResize: (id: string, cols: number, rows: number) =>
    invoke<void>("pty_resize", { id, cols, rows }),
  ptyKill: (id: string) => invoke<void>("pty_kill", { id }),
  listProviderModels: (provider: ProviderConfigPayload) =>
    invoke<ModelSummary[]>("list_provider_models", { provider }),
  checkProviderConnection: (provider: ProviderConfigPayload) =>
    invoke<boolean>("check_provider_connection", { provider }),
  loadConversationHistory: (sessionId: string) =>
    invoke<PersistedMessage[]>("load_conversation_history", { sessionId }),
  clearConversation: (sessionId: string) =>
    invoke<void>("clear_conversation", { sessionId }),
  compactConversation: (
    sessionId: string,
    provider: ProviderConfigPayload,
    model: string,
  ) => invoke<string>("compact_conversation", { sessionId, provider, model }),
  sendPrompt: (
    sessionId: string,
    provider: ProviderConfigPayload,
    model: string,
    message: string,
  ) => invoke<void>("send_prompt", { sessionId, provider, model, message }),
  retryLast: (
    sessionId: string,
    provider: ProviderConfigPayload,
    model: string,
  ) => invoke<void>("retry_last", { sessionId, provider, model }),
  cancelPrompt: (sessionId: string) =>
    invoke<void>("cancel_prompt", { sessionId }),
  // The `!command` chat-input escape — runs `command` as a shell command
  // directly (no LLM turn, no permission prompt) and returns its output;
  // the backend also records it as a real tool-call/result pair (see
  // `run_shell_command` in `tools.rs`), so callers don't need to touch
  // `entries` themselves — the existing `tool_call`/`tool_result` listeners
  // in `ChatPanel.tsx` pick it up the same as a live agent turn would.
  runShellCommand: (sessionId: string, command: string) =>
    invoke<string>("run_shell_command", { sessionId, command }),
  sendPromptAcp: (
    sessionId: string,
    launchCommand: string,
    provider: ProviderConfigPayload,
    model: string,
    message: string,
  ) =>
    invoke<void>("send_prompt_acp", {
      sessionId,
      launchCommand,
      provider,
      model,
      message,
    }),
  setAcpModel: (sessionId: string, value: string) =>
    invoke<void>("set_acp_model", { sessionId, value }),
  fetchAcpModels: (launchCommand: string) =>
    invoke<AcpModelOptions | null>("fetch_acp_models", { launchCommand }),
  listSubAgents: () => invoke<SubAgentSummary[]>("list_sub_agents"),
  deleteSubAgent: (subSessionId: string) =>
    invoke<void>("delete_sub_agent", { subSessionId }),
  respondPermission: (id: string, approved: boolean) =>
    invoke<void>("respond_permission", { id, approved }),
  setPermissionMode: (sessionId: string, bypass: boolean) =>
    invoke<void>("set_permission_mode", { sessionId, bypass }),
  reportFrontendCrash: (kind: string, message: string, stack?: string) =>
    invoke<void>("report_frontend_crash", { kind, message, stack }),
  getCrashLog: () => invoke<string>("get_crash_log"),
  clearCrashLog: () => invoke<void>("clear_crash_log"),
};
