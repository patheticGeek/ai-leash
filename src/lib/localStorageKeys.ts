// Every localStorage key ai-leash writes, gathered in one place so a key
// string is only ever spelled out once. Pair with `localStorageJson.ts`'s
// read/write wrapper for anything storing JSON rather than a raw string.
export const LS_KEYS = {
  defaultBackend: "ai-leash:defaultBackend",
  agentBackend: "ai-leash:agentBackend",
  conversationBackend: "ai-leash:conversationBackend",
  providerConfig: "ai-leash:providerConfig",
  permissionMode: "ai-leash:permissionMode",
  recentProjects: "ai-leash:recentProjects",
  // Legacy, pre-multi-project-sidebar key — only ever read once, for
  // migration into `recentProjects` (see `projectSlice.ts`), never written.
  lastProjectRoot: "ai-leash:lastProjectRoot",
  lastModel: "ai-leash:lastModel",
  leftBarWidth: "ai-leash:leftBarWidth",
  rightPanelWidth: "ai-leash:rightPanelWidth",
  // Per-session draft text — not a standalone key, see `chatDraftKey` in
  // `chatDraft.ts` for how a session id is appended to this.
  chatDraftPrefix: "ai-leash:chatDraft:",
} as const;
