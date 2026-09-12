import type { StateCreator } from "zustand";
import { LS_KEYS } from "../lib/localStorageKeys";
import type { AppStore } from "./index";
import { localStorageJson } from "./localStorageJson";

// `migrateFromOldKeys` below reads `LS_KEYS.providerConfig`/`agentBackend`
// once, the first time `LS_KEYS.defaultBackend` doesn't exist yet —
// `providerSlice.ts`/`acpSlice.ts` no longer read `activeId`/`kind`/
// `activeAcpId` out of those same keys at all, so this is the only place
// they're still consulted.

// Canonical id of the Ollama card seeded into a fresh install (and what the
// pre-multi-Ollama singleton config migrates to) — defined here, and
// imported into `providerSlice.ts`, so both agree on what "the default
// Ollama card" is called without a circular import between the two.
export const DEFAULT_OLLAMA_ID = "ollama-default";

// One shared "which backend answers a brand-new conversation" setting —
// replaces the pre-merge trio of `providerSettings.activeId` /
// `agentBackend.kind` / `agentBackend.activeAcpId`. Set by clicking a card
// in the settings Agents tab. A conversation that's already picked its own
// backend (`ConversationBackendSelection`, in `acpSlice.ts`) is unaffected
// by this changing later — this is only where a *new* conversation starts
// from (see `useChatSession.ts`'s lazy `useState` initializers).
export type DefaultBackendRef =
  | { kind: "builtin"; providerId: string } // id into providerSettings.ollama or .openAiCompatible
  | { kind: "acp"; acpId: string }; // id into agentBackend.acpAgents

function readOldJson(key: string): Record<string, unknown> | null {
  const parsed = localStorageJson.read<unknown>(key, null);
  return parsed && typeof parsed === "object"
    ? (parsed as Record<string, unknown>)
    : null;
}

// Only consulted the very first time `ai-leash:defaultBackend` doesn't
// exist yet — reads the old, now-superseded raw keys directly (rather than
// going through `providerSlice`/`acpSlice`'s own loaders, which no longer
// know about `activeId`/`kind`/`activeAcpId` at all) so an existing user's
// current default carries over instead of silently resetting to Ollama.
function migrateFromOldKeys(): DefaultBackendRef | null {
  const oldAgent = readOldJson(LS_KEYS.agentBackend);
  if (
    oldAgent?.kind === "acp" &&
    typeof oldAgent.activeAcpId === "string" &&
    oldAgent.activeAcpId
  ) {
    return { kind: "acp", acpId: oldAgent.activeAcpId };
  }
  const oldProvider = readOldJson(LS_KEYS.providerConfig);
  if (oldProvider && typeof oldProvider.activeId === "string") {
    // The old shape used the literal string "ollama" as a sentinel for the
    // (then-singleton) Ollama config — the migrated card now has a real id.
    const providerId =
      oldProvider.activeId === "ollama"
        ? DEFAULT_OLLAMA_ID
        : oldProvider.activeId;
    return { kind: "builtin", providerId };
  }
  return null;
}

function loadDefaultBackend(): DefaultBackendRef {
  // biome-ignore lint/suspicious/noExplicitAny: shape is validated below field-by-field
  const parsed = localStorageJson.read<any>(LS_KEYS.defaultBackend, null);
  if (
    parsed &&
    ((parsed.kind === "builtin" && typeof parsed.providerId === "string") ||
      (parsed.kind === "acp" && typeof parsed.acpId === "string"))
  ) {
    return parsed;
  }
  return (
    migrateFromOldKeys() ?? { kind: "builtin", providerId: DEFAULT_OLLAMA_ID }
  );
}

function saveDefaultBackend(ref: DefaultBackendRef) {
  localStorageJson.write(LS_KEYS.defaultBackend, ref);
}

export interface BackendSlice {
  defaultBackend: DefaultBackendRef;
  setDefaultBackend: (ref: DefaultBackendRef) => void;
  // Called after a provider/ACP config list changes (deletion) — if the
  // current default now points at an id that no longer exists in either
  // list, reassigns it to another configured card (first Ollama, then
  // first OpenAI-compatible, then first ACP agent) instead of leaving it
  // dangling. Mirrors the per-list delete fallbacks that used to live
  // directly in `providerSlice.ts`/`acpSlice.ts` before there was one
  // shared default to keep in sync.
  reconcileDefaultBackend: () => void;
}

export const backendSlice: StateCreator<AppStore, [], [], BackendSlice> = (
  set,
  get,
) => ({
  defaultBackend: loadDefaultBackend(),

  setDefaultBackend: (ref) =>
    set(() => {
      saveDefaultBackend(ref);
      return { defaultBackend: ref };
    }),

  reconcileDefaultBackend: () => {
    const { defaultBackend, providerSettings, agentBackend } = get();
    const exists =
      defaultBackend.kind === "builtin"
        ? providerSettings.ollama.some(
            (c) => c.id === defaultBackend.providerId,
          ) ||
          providerSettings.openAiCompatible.some(
            (c) => c.id === defaultBackend.providerId,
          )
        : agentBackend.acpAgents.some((c) => c.id === defaultBackend.acpId);
    if (exists) return;
    const fallback: DefaultBackendRef = providerSettings.ollama[0]
      ? { kind: "builtin", providerId: providerSettings.ollama[0].id }
      : providerSettings.openAiCompatible[0]
        ? {
            kind: "builtin",
            providerId: providerSettings.openAiCompatible[0].id,
          }
        : agentBackend.acpAgents[0]
          ? { kind: "acp", acpId: agentBackend.acpAgents[0].id }
          : { kind: "builtin", providerId: DEFAULT_OLLAMA_ID };
    get().setDefaultBackend(fallback);
  },
});
