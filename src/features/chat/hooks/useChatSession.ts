import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import {
  type AcpCommandInfo,
  type AcpModelOptions,
  api,
} from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";
import type { PickerOption } from "../components/ModelPickerPopover";

const LAST_MODEL_KEY = "ai-leash:lastModel";

// Commands we handle ourselves, client-side, rather than sending as a
// prompt — no ACP agent implements a matching request (the protocol
// doesn't define one), so these exist purely as local UI bookkeeping.
// Listed alongside whatever the connected ACP agent advertises (see
// `acpCommands`) so they show up in the same autocomplete popover; a
// local command wins over an agent-advertised one of the same name.
export const LOCAL_COMMANDS: AcpCommandInfo[] = [
  {
    name: "clear",
    description: "Clear this conversation's history",
    hint: null,
  },
  { name: "model", description: "Open the model/agent picker", hint: null },
  { name: "help", description: "List available commands", hint: null },
];

// Only offered for the built-in provider loop we drive ourselves — an ACP
// agent's real context lives inside its own subprocess, so there's nothing
// to compact from out here, and some agents implement a genuine "/compact"
// of their own that intercepting the name locally would otherwise shadow.
// Kept separate from `LOCAL_COMMANDS` so `isAcp` conversations never list
// or intercept it, letting an agent-advertised "/compact" (if any) pass
// straight through as a normal prompt like any other agent command.
export const COMPACT_COMMAND: AcpCommandInfo = {
  name: "compact",
  description: "Summarize this conversation to reclaim context",
  hint: null,
};

// Owns "who answers this chat" for one conversation: builtin provider vs.
// ACP agent, which model, and the per-conversation persistence of that
// choice — the part of `ChatPanel.tsx` that used to be a dozen
// interdependent `useState`/`useEffect` pairs around `kind`/
// `providerActiveId`/`acpActiveId`/`acpModelChoice`/`model`. See
// `docs/features/agent-chat.md` for what "backend" means here.
export function useChatSession(
  sessionId: string,
  setError: (message: string | null) => void,
  // Whether a turn is currently in flight — only used to pause the 5s
  // Ollama model-list poll while one is (see original `ChatPanel.tsx`
  // behavior); owned by `ChatPanel` itself, not this hook.
  sending: boolean,
  // Runs whenever the connected ACP agent changes and this hook resets its
  // own ACP-related state — lets the caller reset state it owns that also
  // needs to go stale at the same time (currently just the slash-command
  // popover's dismissed-query bookkeeping in `ChatPanel.tsx`).
  onAcpAgentReset: () => void,
) {
  const models = useAppStore((s) => s.ollamaModels);
  const providerConnectivity = useAppStore((s) => s.providerConnectivity);
  const refreshOllama = useAppStore((s) => s.refreshOllama);
  const providerSettings = useAppStore((s) => s.providerSettings);
  const setActiveProvider = useAppStore((s) => s.setActiveProvider);
  const agentBackend = useAppStore((s) => s.agentBackend);
  const setAgentBackendKind = useAppStore((s) => s.setAgentBackendKind);
  const setActiveAcpAgent = useAppStore((s) => s.setActiveAcpAgent);
  const acpModelCache = useAppStore((s) => s.acpModelCache);
  // This conversation's own backend/model choice — read once at mount (this
  // component remounts per project, so `sessionId` is stable for its whole
  // lifetime) from whatever it last used, falling back to the shared
  // defaults above only the very first time this conversation is opened.
  // From here on this is the source of truth for *this* conversation;
  // switching to a different one can't change what this shows, and picking
  // something new here doesn't leak into other conversations (only into
  // the shared defaults new, never-touched ones inherit — see
  // `setConversationBackend` below).
  const setConversationBackend = useAppStore((s) => s.setConversationBackend);
  const [kind, setKind] = useState<"builtin" | "acp">(() => {
    const st = useAppStore.getState();
    return st.conversationBackend[sessionId]?.kind ?? st.agentBackend.kind;
  });
  const [providerActiveId, setProviderActiveId] = useState<string>(() => {
    const st = useAppStore.getState();
    return (
      st.conversationBackend[sessionId]?.providerActiveId ??
      st.providerSettings.activeId
    );
  });
  const [acpActiveId, setAcpActiveId] = useState<string | null>(() => {
    const st = useAppStore.getState();
    return (
      st.conversationBackend[sessionId]?.acpActiveId ??
      st.agentBackend.activeAcpId
    );
  });
  const [acpModelChoice, setAcpModelChoice] = useState<string | null>(
    () =>
      useAppStore.getState().conversationBackend[sessionId]?.acpModel ?? null,
  );
  const isAcp = kind === "acp";
  const isOpenAiCompatible = !isAcp && providerActiveId !== "ollama";
  const activeAcpAgent = agentBackend.acpAgents.find(
    (c) => c.id === acpActiveId,
  );
  // Only set if the connected ACP agent advertises a Model config option
  // (see docs/features/agent-chat.md) — most agents won't, in which case
  // this stays null and no model dropdown shows for ACP mode.
  const [acpModelOptions, setAcpModelOptions] =
    useState<AcpModelOptions | null>(null);
  // Slash commands the connected ACP agent advertises, if any — most agents
  // won't send this notification at all, in which case typing "/" does
  // nothing special. See `chat://{sessionId}/acp_commands` below.
  const [acpCommands, setAcpCommands] = useState<AcpCommandInfo[]>([]);
  const [model, setModel] = useState(
    () => useAppStore.getState().conversationBackend[sessionId]?.model ?? "",
  );
  // Suppresses exactly one *real* run of the reset effect below, for the
  // "switch agent and pick one of its models in the same click" case (set
  // by `selectBackendOption`). Deliberately *not* relied on to protect the
  // effect's very first run at mount — see `lastResetAcpActiveIdRef` for
  // why a consume-once flag alone isn't safe there.
  const skipNextAcpResetRef = useRef(false);
  // The reset effect only does its work when `acpActiveId` has actually
  // changed since the last time it ran — tracked here instead of relying
  // solely on `skipNextAcpResetRef`, because React StrictMode deliberately
  // double-invokes every effect on mount (setup → cleanup → setup again) to
  // catch non-idempotent effects, and a "run once, consume a flag" guard is
  // exactly that: the first of the two mount-time invocations consumes the
  // flag, so the *second* one runs for real and wipes the `acpModelChoice`
  // this conversation just restored from persisted state, on every fresh
  // mount. Comparing against the last value this effect actually processed
  // is idempotent no matter how many times it's invoked with the same
  // `acpActiveId`, which a plain boolean flag can't guarantee.
  const lastResetAcpActiveIdRef = useRef(acpActiveId);
  // Tracks the last `acpModelChoice` actually sent to the *current*
  // connection, so the apply-effect doesn't resend it every time some
  // unrelated dependency changes, and so a fresh connection (after an
  // agent switch) knows it hasn't applied anything yet.
  const appliedAcpModelRef = useRef<string | null>(null);

  // Keeps this conversation's own choice durable across remounts (a project
  // switch away and back, or an app restart) — writes the full snapshot
  // whenever any piece of it changes. Also backfills a record for a
  // conversation that's never explicitly picked anything yet, which is
  // harmless (it's just re-saving the same defaults it read at mount).
  useEffect(() => {
    setConversationBackend(sessionId, {
      kind,
      providerActiveId,
      acpActiveId,
      model,
      acpModel: acpModelChoice,
    });
  }, [
    sessionId,
    kind,
    providerActiveId,
    acpActiveId,
    model,
    acpModelChoice,
    setConversationBackend,
  ]);

  // Model options are per-connection (they only exist once a session's ACP
  // subprocess replies to session/new) — clear the stale ones, and the
  // previously-chosen model, whenever which ACP agent is active changes.
  // Suppressed once by `selectBackendOption` when it's switching agent AND
  // setting a model choice in the same click — otherwise this would wipe
  // that choice right back out before it ever got a chance to apply.
  // biome-ignore lint/correctness/useExhaustiveDependencies: onAcpAgentReset is a fresh function reference every render (not memoized) and would make this effect re-run every render for no reason — it's only meant to fire alongside a real `acpActiveId` change, guarded above
  useEffect(() => {
    if (lastResetAcpActiveIdRef.current === acpActiveId) return;
    lastResetAcpActiveIdRef.current = acpActiveId;
    if (skipNextAcpResetRef.current) {
      skipNextAcpResetRef.current = false;
      return;
    }
    setAcpModelOptions(null);
    setAcpModelChoice(null);
    appliedAcpModelRef.current = null;
    setAcpCommands([]);
    onAcpAgentReset();
  }, [acpActiveId]);

  async function selectAcpModel(value: string) {
    setAcpModelOptions((prev) =>
      prev ? { ...prev, currentValue: value } : prev,
    );
    try {
      await api.setAcpModel(sessionId, value);
    } catch (e) {
      setError(String(e));
    }
  }

  // Applies a model choice (from the unified popover's per-model ACP rows)
  // once a real connection actually reports its options — either right
  // after the first prompt connects, or immediately if the agent was
  // already connected when a different model was picked. Reopening a
  // conversation restores its last `acpModelChoice` from persisted state
  // (see the lazy `useState` initializer above), so this also re-applies it
  // to a freshly (re)connected subprocess after an app restart.
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectAcpModel is a fresh function reference every render (not memoized) and would make this effect re-run every render for no reason; appliedAcpModelRef already makes the call idempotent per acpModelChoice
  useEffect(() => {
    if (!acpModelOptions || !acpModelChoice) return;
    if (appliedAcpModelRef.current === acpModelChoice) return;
    if (acpModelOptions.currentValue !== acpModelChoice) {
      selectAcpModel(acpModelChoice);
    }
    appliedAcpModelRef.current = acpModelChoice;
  }, [acpModelOptions, acpModelChoice]);

  useEffect(() => {
    refreshOllama();
  }, [refreshOllama]);

  useEffect(() => {
    if (sending) return;
    const interval = setInterval(refreshOllama, 5000);
    return () => clearInterval(interval);
  }, [sending, refreshOllama]);

  // Ollama has no live models yet the first time a brand-new conversation
  // opens on it — fill in a sensible one once the list loads. Conversations
  // that already have a `model` (from their own persisted choice, or from
  // just having picked one) are left alone.
  useEffect(() => {
    if (isOpenAiCompatible || isAcp) return;
    if (model || !models.length) return;
    const last = localStorage.getItem(LAST_MODEL_KEY);
    const restored = last && models.some((m) => m.name === last) ? last : null;
    setModel(restored ?? models[0].name);
  }, [models, model, isOpenAiCompatible, isAcp]);

  // This conversation's own active provider's reachability — looked up from
  // the app-wide per-provider map (`providerConnectivity`, refreshed
  // regardless of which conversation is open) rather than a single global
  // "the active provider is connected" flag, since which provider counts as
  // "active" is now per-conversation.
  useEffect(() => {
    if (isAcp) return;
    const connected = providerConnectivity[providerActiveId];
    if (connected === false) {
      setError(
        providerActiveId === "ollama"
          ? `Could not reach Ollama at ${providerSettings.ollama.host || "localhost:11434"}. Is \`ollama serve\` running?`
          : "Could not reach the configured provider. Check the base URL and API key in provider settings.",
      );
    } else if (connected === true) {
      setError(null);
    }
  }, [
    providerConnectivity,
    providerActiveId,
    isAcp,
    providerSettings.ollama.host,
    setError,
  ]);

  useEffect(() => {
    const unlistens: Promise<() => void>[] = [];
    unlistens.push(
      listen<AcpModelOptions>(`chat://${sessionId}/acp_model_options`, (e) => {
        setAcpModelOptions(e.payload);
      }),
    );
    unlistens.push(
      listen<AcpCommandInfo[]>(`chat://${sessionId}/acp_commands`, (e) => {
        setAcpCommands(e.payload);
      }),
    );
    return () => {
      unlistens.forEach((u) => {
        u.then((f) => f());
      });
    };
  }, [sessionId]);

  const selectedModel = models.find((m) => m.name === model);
  const contextLength = selectedModel?.contextLength ?? null;

  // Providers and ACP agents are both just "who answers this chat" from the
  // user's point of view, so they share one picker instead of a hard
  // `isAcp` fork — picking any option here can flip this conversation's own
  // `kind` as a side effect. Ollama's own models are listed individually
  // (one entry per model), and so are an ACP agent's — using its cached
  // model list (see `acpModelCache`/`fetchAcpModelsFor` in store.ts) when
  // one's known, falling back to a single bare-agent row otherwise
  // (unfetched yet, or the agent doesn't expose a model to pick).
  const backendOptions: PickerOption[] = [
    ...(models.length > 0
      ? models.map((m) => ({
          key: `ollama:${m.name}`,
          label: m.name,
          subtitle: "Ollama",
        }))
      : [
          {
            key: "ollama",
            label: "Ollama",
            subtitle: providerSettings.ollama.host || "localhost:11434",
          },
        ]),
    ...providerSettings.openAiCompatible.map((c) => ({
      key: `openai:${c.id}`,
      label: c.label,
      subtitle: "OpenAI-compatible",
    })),
    ...agentBackend.acpAgents.flatMap((c) => {
      // Prefer the throwaway-session cache (available for every saved
      // agent, not just the one this conversation has active), but fall
      // back to the *live* connection's own options for whichever agent
      // this conversation is actually connected to right now — that's
      // strictly fresher, and covers the rare case where the cache fetch
      // failed but a real chat still succeeded.
      const known =
        acpModelCache[c.id] ?? (c.id === acpActiveId ? acpModelOptions : null);
      if (known && known.options.length > 0) {
        return known.options.map((o) => ({
          key: `acp:${c.id}:${o.value}`,
          label: o.name,
          subtitle: `${c.label} · ACP`,
        }));
      }
      return [{ key: `acp:${c.id}`, label: c.label, subtitle: "ACP agent" }];
    }),
  ];
  // Falls all the way through to the cache's own `currentValue` (the
  // agent's actual default model, as reported by the discovery fetch) when
  // this conversation never explicitly chose one and isn't live-connected
  // yet — without this, `activeBackendKey` below would point at the bare
  // `acp:{agentId}` row, which stops existing in `backendOptions` the
  // moment the cache hydrates (once an agent has known models, its rows
  // are *only* per-model — see the `flatMap` above), so the lookup would
  // fail and silently fall back to showing the agent's own name as if it
  // were a model.
  const activeAcpModelValue =
    acpModelChoice ??
    acpModelOptions?.currentValue ??
    (activeAcpAgent
      ? acpModelCache[activeAcpAgent.id]?.currentValue
      : undefined) ??
    null;
  const activeBackendKey = isAcp
    ? activeAcpAgent
      ? activeAcpModelValue
        ? `acp:${activeAcpAgent.id}:${activeAcpModelValue}`
        : `acp:${activeAcpAgent.id}`
      : null
    : isOpenAiCompatible
      ? `openai:${providerActiveId}`
      : model
        ? `ollama:${model}`
        : "ollama";
  const activeBackendLabel = isAcp
    ? // A chosen model's friendly name comes from `backendOptions`, built
      // from `acpModelCache`/live `acpModelOptions` — but that cache can
      // still be loading (or have failed to load) right after switching to
      // this conversation, before it's had a chance to resolve. In that
      // window, fall back to the raw model value rather than the agent's
      // own label — showing "Claude Code" as if *it* were the selected
      // model would be actively wrong, not just imprecise. Only fall back
      // to the agent label when no model has actually been chosen at all.
      (backendOptions.find((o) => o.key === activeBackendKey)?.label ??
      activeAcpModelValue ??
      activeAcpAgent?.label ??
      "select agent")
    : isOpenAiCompatible
      ? (providerSettings.openAiCompatible.find(
          (c) => c.id === providerActiveId,
        )?.label ?? "select provider")
      : model || "select model";

  function selectBackendOption(key: string) {
    if (key.startsWith("acp:")) {
      const rest = key.slice("acp:".length);
      const sepIdx = rest.indexOf(":");
      const agentId = sepIdx === -1 ? rest : rest.slice(0, sepIdx);
      const modelValue = sepIdx === -1 ? null : rest.slice(sepIdx + 1);
      if (modelValue && agentId !== acpActiveId) {
        // The agent-change reset effect (keyed on `acpActiveId`) would
        // otherwise immediately null back out the `acpModelChoice` we're
        // about to set in this same click. Only needed when we're setting
        // a real choice — picking the bare fallback row (no model known
        // yet) for a genuinely different agent should still let the reset
        // effect clear out the previous agent's stale `acpModelOptions`.
        skipNextAcpResetRef.current = true;
      }
      setKind("acp");
      setAcpActiveId(agentId);
      setAcpModelChoice(modelValue);
      // Also nudges the shared defaults, so a brand-new conversation opened
      // later starts from whatever was most recently picked anywhere.
      setAgentBackendKind("acp");
      setActiveAcpAgent(agentId);
    } else if (key.startsWith("openai:")) {
      const id = key.slice("openai:".length);
      const config = providerSettings.openAiCompatible.find((c) => c.id === id);
      setKind("builtin");
      setProviderActiveId(id);
      setModel(config?.model ?? "");
      setAgentBackendKind("builtin");
      setActiveProvider(id);
    } else {
      setKind("builtin");
      setProviderActiveId("ollama");
      setAgentBackendKind("builtin");
      setActiveProvider("ollama");
      if (key.startsWith("ollama:")) {
        const name = key.slice("ollama:".length);
        setModel(name);
        localStorage.setItem(LAST_MODEL_KEY, name);
      }
    }
  }

  return {
    isAcp,
    isOpenAiCompatible,
    providerActiveId,
    activeAcpAgent,
    acpCommands,
    model,
    setModel,
    contextLength,
    backendOptions,
    activeBackendKey,
    activeBackendLabel,
    selectBackendOption,
  };
}
