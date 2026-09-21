import { create } from "zustand";
import { type AcpSlice, acpSlice } from "./acpSlice";
import { type BackendSlice, backendSlice } from "./backendSlice";
import { type ConversationSlice, conversationSlice } from "./conversationSlice";
import { type DebugSlice, debugSlice } from "./debugSlice";
import { type ElicitationSlice, elicitationSlice } from "./elicitationSlice";
import { type PanelSlice, panelSlice } from "./panelSlice";
import { type PermissionSlice, permissionSlice } from "./permissionSlice";
import { type PreferencesSlice, preferencesSlice } from "./preferencesSlice";
import { type ProjectSlice, projectSlice } from "./projectSlice";
import { type ProviderSlice, providerSlice } from "./providerSlice";
import { type SubAgentSlice, subAgentSlice } from "./subAgentSlice";

export type AppStore = ProjectSlice &
  ProviderSlice &
  AcpSlice &
  BackendSlice &
  PermissionSlice &
  ElicitationSlice &
  SubAgentSlice &
  PanelSlice &
  ConversationSlice &
  DebugSlice &
  PreferencesSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...projectSlice(...a),
  ...providerSlice(...a),
  ...acpSlice(...a),
  ...backendSlice(...a),
  ...permissionSlice(...a),
  ...elicitationSlice(...a),
  ...subAgentSlice(...a),
  ...panelSlice(...a),
  ...conversationSlice(...a),
  ...debugSlice(...a),
  ...preferencesSlice(...a),
}));

export type {
  AcpAgentConfig,
  AgentBackendSettings,
  ConversationBackendSelection,
} from "./acpSlice";
export type { DefaultBackendRef } from "./backendSlice";
export type { ConversationSummary } from "./conversationSlice";
export type { AcpDebugEvent } from "./debugSlice";
export { elicitationForSession } from "./elicitationSlice";
export type {
  ChatTab,
  ChatTabKind,
  PanelTab,
  PanelTabKind,
} from "./panelSlice";
export type { PermissionMode } from "./permissionSlice";
export { permissionForSession } from "./permissionSlice";
// Re-exported so every existing `from "../store"` (or `from "./store"`)
// import site keeps working unchanged — this module is the same public API
// `src/store.ts` used to export directly, just backed by slices now.
export type { RecentProject } from "./projectSlice";
export type {
  OllamaProviderConfig,
  OpenAiCompatibleProviderConfig,
  ProviderConfig,
} from "./providerSlice";
export type { SubAgentTask } from "./subAgentSlice";
