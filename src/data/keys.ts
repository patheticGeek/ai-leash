// Every React Query key in the app, in one place. A key's params must be
// exactly its queryFn's inputs, so keep the two in step when editing either.
//
// Convention for anything that belongs to a single conversation: put it
// under `["conversation", id, ...]` so deleting the conversation is one
// `removeQueries({ queryKey: ["conversation", id] })` prefix sweep. Add those
// keys here when their queries land (see PLAN.md).
export const qk = {
  acpCatalog: ["acp-agent-catalog"] as const,
  actions: (checkoutPath: string | null) => ["actions", checkoutPath] as const,
  // Prefix of every `fsDir` key — for predicate-based invalidation.
  fsDirs: ["fs-dir"] as const,
  // The path slot is always a real absolute path (the checkout root listing
  // uses `checkoutPath` itself) so `fs://changed` payloads can match it.
  fsDir: (checkoutPath: string, path?: string) =>
    ["fs-dir", checkoutPath, path ?? checkoutPath] as const,
  generating: (sessionId: string) => ["generating", sessionId] as const,
  gitBranch: (path: string) => ["git-branch", path] as const,
  preferences: ["preferences"] as const,
  ollamaModels: (configId: string) => ["ollama-models", configId] as const,
  systemFonts: ["system-fonts"] as const,
};
