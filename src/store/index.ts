import { create } from "zustand";
import { type ConversationSlice, conversationSlice } from "./conversationSlice";
import { type DebugSlice, debugSlice } from "./debugSlice";
import { type ElicitationSlice, elicitationSlice } from "./elicitationSlice";
import { type PanelSlice, panelSlice } from "./panelSlice";
import { type PermissionSlice, permissionSlice } from "./permissionSlice";
import { type ProjectSlice, projectSlice } from "./projectSlice";
import { type SelectionSlice, selectionSlice } from "./selectionSlice";
import { type SubAgentSlice, subAgentSlice } from "./subAgentSlice";

export type AppStore = ProjectSlice &
  SelectionSlice &
  PermissionSlice &
  ElicitationSlice &
  SubAgentSlice &
  PanelSlice &
  ConversationSlice &
  DebugSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...projectSlice(...a),
  ...selectionSlice(...a),
  ...permissionSlice(...a),
  ...elicitationSlice(...a),
  ...subAgentSlice(...a),
  ...panelSlice(...a),
  ...conversationSlice(...a),
  ...debugSlice(...a),
}));

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
export type { ConversationBackendSelection } from "./selectionSlice";
export type { SubAgentTask } from "./subAgentSlice";
