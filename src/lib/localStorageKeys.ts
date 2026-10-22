// Every localStorage key ai-leash writes, gathered in one place so a key
// string is only ever spelled out once. Pair with `localStorageJson.ts`'s
// read/write wrapper for anything storing JSON rather than a raw string.
export const LS_KEYS = {
  // Legacy backend settings, moved to Rust's `backends.json` — only read
  // once, by `bootBackends` (`data/backends.ts`), never written.
  defaultBackend: "ai-leash:defaultBackend",
  agentBackend: "ai-leash:agentBackend",
  providerConfig: "ai-leash:providerConfig",
  lastModel: "ai-leash:lastModel",
  // Legacy, pre-DB-column keys (per-conversation backend/model and
  // Ask/Bypass choice moved into `conversations` — see
  // `selectionSlice.hydrateConversationBackendFromRows`/
  // `permissionSlice.hydratePermissionModeFromRows`) — only ever read once,
  // for migration, never written.
  conversationBackend: "ai-leash:conversationBackend",
  permissionMode: "ai-leash:permissionMode",
  recentProjects: "ai-leash:recentProjects",
  // Legacy, pre-multi-project-sidebar key — only ever read once, for
  // migration into `recentProjects` (see `projectSlice.ts`), never written.
  lastProjectRoot: "ai-leash:lastProjectRoot",
  leftBarWidth: "ai-leash:leftBarWidth",
  rightPanelWidth: "ai-leash:rightPanelWidth",
  // Per-session draft text — not a standalone key, see `chatDraftKey` in
  // `chatDraft.ts` for how a session id is appended to this.
  chatDraftPrefix: "ai-leash:chatDraft:",
  // Per-conversation side-area and centre-area open-tab (`WorkspaceTab`)
  // state, keyed by conversation id — see `panelSlice.ts`'s
  // `persistActiveSessionTabState`. Only ever written for conversations that
  // have actually been sent (listed in `conversations`); a new, unsent
  // thread's tabs live in memory only and are gone on the next restart.
  tabState: "ai-leash:tabState",
  debugPanelWidth: "ai-leash:debugPanelWidth",
  // The rest of the floating ACP Events panel's persisted geometry — see
  // `useFloatingDebugPanel.ts`. `debugPanelWidth` predates it being
  // free-floating (it was docked to the right edge, full height, width-only)
  // and keeps its original key for continuity.
  debugPanelHeight: "ai-leash:debugPanelHeight",
  debugPanelX: "ai-leash:debugPanelX",
  debugPanelY: "ai-leash:debugPanelY",
} as const;
