import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { useAcpAgentCatalog } from "../../../lib/acpCatalogQuery";
import { LS_KEYS } from "../../../lib/localStorageKeys";
import { useOllamaModelsByConfig } from "../../../lib/ollamaModelsQuery";
import {
  type AcpCommandInfo,
  type AcpEffortOptions,
  type AcpModelOptions,
  api,
} from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";
import { isEnabled } from "../../../store/backendSlice";
import type { PickerOption } from "../components/popovers/ModelPickerPopover";

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
) {
  const providerConnectivity = useAppStore((s) => s.providerConnectivity);
  const providerSettings = useAppStore((s) => s.providerSettings);
  const ollamaModelsByConfig = useOllamaModelsByConfig(
    providerSettings.ollama.filter(isEnabled),
  );
  const agentBackend = useAppStore((s) => s.agentBackend);
  // Rust-authoritative catalog of discovered ACP models/effort levels —
  // persisted to disk and kept fresh across restarts by its own background
  // refresh (see `acp::refresh_acp_catalog_in_background`), so there's no
  // frontend-side retry-on-mount needed here anymore.
  const acpCatalog = useAcpAgentCatalog();
  const setDefaultBackend = useAppStore((s) => s.setDefaultBackend);
  // This conversation's own backend/model choice — read once at mount (this
  // component remounts per conversation, via `App.tsx`'s `key={activeSessionId}`,
  // so `sessionId` is stable for its whole lifetime) from whatever it last
  // used, falling back to the shared
  // `defaultBackend` (see `backendSlice.ts`) only the very first time this
  // conversation is opened. From here on this is the source of truth for
  // *this* conversation; switching to a different one can't change what
  // this shows, and picking something new here doesn't leak into other
  // conversations (only into the shared default new, never-touched ones
  // inherit — see `setConversationBackend` below).
  const setConversationBackend = useAppStore((s) => s.setConversationBackend);
  const [kind, setKind] = useState<"builtin" | "acp">(() => {
    const st = useAppStore.getState();
    return st.conversationBackend[sessionId]?.kind ?? st.defaultBackend.kind;
  });
  const [providerActiveId, setProviderActiveId] = useState<string>(() => {
    const st = useAppStore.getState();
    return (
      st.conversationBackend[sessionId]?.providerActiveId ??
      (st.defaultBackend.kind === "builtin"
        ? st.defaultBackend.providerId
        : (st.providerSettings.ollama[0]?.id ?? ""))
    );
  });
  const [acpActiveId, setAcpActiveId] = useState<string | null>(() => {
    const st = useAppStore.getState();
    return (
      st.conversationBackend[sessionId]?.acpActiveId ??
      (st.defaultBackend.kind === "acp" ? st.defaultBackend.acpId : null)
    );
  });
  const [acpModelChoice, setAcpModelChoice] = useState<string | null>(
    () =>
      useAppStore.getState().conversationBackend[sessionId]?.acpModel ?? null,
  );
  const [acpEffortChoice, setAcpEffortChoice] = useState<string | null>(
    () =>
      useAppStore.getState().conversationBackend[sessionId]?.acpEffort ?? null,
  );
  const isAcp = kind === "acp";
  const isOpenAiCompatible =
    !isAcp && !providerSettings.ollama.some((c) => c.id === providerActiveId);
  const activeAcpAgent = agentBackend.acpAgents.find(
    (c) => c.id === acpActiveId,
  );
  // This conversation's own backend was switched off in Settings > Agents
  // after it was picked — it stays selected (nothing silently swaps it for
  // another), but nothing may be sent to it until it's turned back on or
  // another agent is picked.
  const activeConfig = isAcp
    ? activeAcpAgent
    : (providerSettings.ollama.find((c) => c.id === providerActiveId) ??
      providerSettings.openAiCompatible.find((c) => c.id === providerActiveId));
  const backendDisabled = !!activeConfig && !isEnabled(activeConfig);
  const backendDisabledReason = backendDisabled
    ? `${activeConfig?.label} is turned off in Settings > Agents. Turn it back on, or pick another agent from the chat bar.`
    : null;
  useEffect(() => {
    if (!backendDisabledReason) return;
    setError(backendDisabledReason);
    return () => setError(null);
  }, [backendDisabledReason, setError]);

  // Only set if the connected ACP agent advertises a Model config option
  // (see docs/features/agent-chat.md) — most agents won't, in which case
  // this stays null and no model dropdown shows for ACP mode.
  const [acpModelOptions, setAcpModelOptions] =
    useState<AcpModelOptions | null>(null);
  const [acpEffortOptions, setAcpEffortOptions] =
    useState<AcpEffortOptions | null>(null);
  // Slash commands the connected ACP agent advertises, if any — most agents
  // won't send this notification at all, in which case typing "/" does
  // nothing special. See `chat://{sessionId}/acp_commands` below.
  const [acpCommands, setAcpCommands] = useState<AcpCommandInfo[]>([]);
  const [model, setModel] = useState(
    () => useAppStore.getState().conversationBackend[sessionId]?.model ?? "",
  );
  // Set by `selectBackendOption` when picking a model that belongs to a
  // *different* agent than the one currently connected — there's no live
  // connection for that agent yet, so the choice can't go straight into
  // `acpModelChoice`: the apply-effect below would then fire in the very
  // same render as the reset effect, using that render's already-captured
  // (stale, OLD agent's) `acpModelOptions` — a `setState` from an earlier
  // effect in the same commit doesn't retroactively update a later effect's
  // closure, only a *subsequent* render does — sending a "set model"
  // request to the wrong, about-to-be-replaced connection. Stashed here
  // instead, and promoted into `acpModelChoice` once the new connection's
  // own `acp_model_options` event actually arrives (see the listener
  // below), by which point applying it is genuinely safe. Tagged with the
  // agent it's meant for so a stale event from an abandoned, still-tearing-
  // down connection (a rapid second switch before the first one's handshake
  // finished) can't misapply it — checked against `lastResetAcpActiveIdRef`,
  // which the reset effect keeps in sync with `acpActiveId` synchronously,
  // well before any async connection handshake could resolve.
  const pendingCrossAgentModelRef = useRef<{
    agentId: string;
    model: string;
  } | null>(null);
  // Reactive mirror of "is `pendingCrossAgentModelRef` set" — the ref itself
  // doesn't trigger a re-render, but the model picker's trigger button wants
  // to show a spinner in place of the agent icon for this window (see
  // `ModelPickerPopover`'s `loading` prop). Cleared either when the pending
  // choice is actually applied (the listener below) or, as a safety net, on
  // any ACP error for this session — a spawn failure or crashed subprocess
  // means whatever this was waiting for is never coming.
  const [acpModelSwitchPending, setAcpModelSwitchPending] = useState(false);
  // The reset effect only does its work when `acpActiveId` has actually
  // changed since the last time it ran — tracked here rather than a plain
  // "has this effect ever run" boolean, because React StrictMode
  // deliberately double-invokes every effect on mount (setup → cleanup →
  // setup again) to catch non-idempotent effects, and a "run once, consume a
  // flag" guard is exactly that: the first of the two mount-time invocations
  // consumes the flag, so the *second* one runs for real and wipes the
  // `acpModelChoice` this conversation just restored from persisted state,
  // on every fresh mount. Comparing against the last value this effect
  // actually processed is idempotent no matter how many times it's invoked
  // with the same `acpActiveId`, which a plain boolean flag can't guarantee.
  // Also read live by the `acp_model_options` listener below to validate
  // `pendingCrossAgentModelRef` against whichever agent is *actually*
  // current, since it stays in sync synchronously (no `setState` delay).
  const lastResetAcpActiveIdRef = useRef(acpActiveId);
  // Tracks the last `acpModelChoice` actually sent to the *current*
  // connection, so the apply-effect doesn't resend it every time some
  // unrelated dependency changes, and so a fresh connection (after an
  // agent switch) knows it hasn't applied anything yet.
  const appliedAcpModelRef = useRef<string | null>(null);
  const appliedAcpEffortRef = useRef<string | null>(null);

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
      acpEffort: acpEffortChoice,
    });
  }, [
    sessionId,
    kind,
    providerActiveId,
    acpActiveId,
    model,
    acpModelChoice,
    acpEffortChoice,
    setConversationBackend,
  ]);

  // Model options are per-connection (they only exist once a session's ACP
  // subprocess replies to session/new) — clear the stale ones, and the
  // previously-chosen model, whenever which ACP agent is active changes. A
  // model chosen for the *new* agent in the same click as the switch
  // (`selectBackendOption`) isn't lost by this: it goes through
  // `pendingCrossAgentModelRef` instead of `acpModelChoice` until the new
  // connection is actually live (see that ref's doc comment).
  useEffect(() => {
    if (lastResetAcpActiveIdRef.current === acpActiveId) return;
    lastResetAcpActiveIdRef.current = acpActiveId;
    setAcpModelOptions(null);
    setAcpModelChoice(null);
    appliedAcpModelRef.current = null;
    setAcpEffortOptions(null);
    setAcpEffortChoice(null);
    appliedAcpEffortRef.current = null;
    setAcpCommands([]);
  }, [acpActiveId]);

  // Drops the live-discovered model/effort/commands options (and the
  // "already applied" bookkeeping that gates re-sending a choice) without
  // touching the persisted `acpModelChoice`/`acpEffortChoice` preference or
  // which agent is active — unlike the agent-switch reset effect above,
  // which agent this conversation talks to hasn't changed here. For "/clear"
  // (`ChatPanel.tsx`'s `runCommand`): the backend drops its connection
  // to the same agent and reconnects fresh, which re-announces these same
  // options and re-applies the still-remembered choice once it arrives — in
  // the meantime the old, now-stale options shouldn't keep showing as if
  // they were still live.
  function resetAcpConnectionState() {
    setAcpModelOptions(null);
    setAcpEffortOptions(null);
    setAcpCommands([]);
    appliedAcpModelRef.current = null;
    appliedAcpEffortRef.current = null;
  }

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

  async function selectAcpEffort(value: string) {
    setAcpEffortChoice(value);
    // Picked off the catalog's cached options before a live connection has
    // reported in — nothing to send yet, the apply-effect below sends the
    // remembered choice once the real `acp_effort_options` event arrives.
    if (!acpEffortOptions) return;
    setAcpEffortOptions((prev) =>
      prev ? { ...prev, currentValue: value } : prev,
    );
    try {
      await api.setAcpEffort(sessionId, value);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: selectAcpEffort is a fresh function reference every render; this effect is keyed by the persisted effort choice and live options
  useEffect(() => {
    if (!acpEffortOptions || !acpEffortChoice) return;
    if (appliedAcpEffortRef.current === acpEffortChoice) return;
    if (acpEffortOptions.currentValue !== acpEffortChoice) {
      selectAcpEffort(acpEffortChoice);
    }
    appliedAcpEffortRef.current = acpEffortChoice;
  }, [acpEffortOptions, acpEffortChoice]);

  // Ollama has no live models yet the first time a brand-new conversation
  // opens on it — fill in a sensible one once this conversation's active
  // config's list loads. Conversations that already have a `model` (from
  // their own persisted choice, or from just having picked one) are left
  // alone.
  useEffect(() => {
    if (isOpenAiCompatible || isAcp) return;
    const configModels = ollamaModelsByConfig[providerActiveId] ?? [];
    if (model || !configModels.length) return;
    const last = localStorage.getItem(LS_KEYS.lastModel);
    const restored =
      last && configModels.some((m) => m.name === last) ? last : null;
    setModel(restored ?? configModels[0].name);
  }, [
    ollamaModelsByConfig,
    providerActiveId,
    model,
    isOpenAiCompatible,
    isAcp,
  ]);

  // This conversation's own active provider's reachability — looked up from
  // the app-wide per-provider map (`providerConnectivity`, refreshed
  // regardless of which conversation is open) rather than a single global
  // "the active provider is connected" flag, since which provider counts as
  // "active" is now per-conversation.
  useEffect(() => {
    if (isAcp || backendDisabled) return;
    const connected = providerConnectivity[providerActiveId];
    if (connected === false) {
      const ollamaConfig = providerSettings.ollama.find(
        (c) => c.id === providerActiveId,
      );
      setError(
        ollamaConfig
          ? `Could not reach Ollama at ${ollamaConfig.host || "localhost:11434"}. Is \`ollama serve\` running?`
          : "Could not reach the configured provider. Check the base URL and API key in provider settings.",
      );
    } else if (connected === true) {
      setError(null);
    }
  }, [
    providerConnectivity,
    providerActiveId,
    isAcp,
    backendDisabled,
    providerSettings.ollama,
    setError,
  ]);

  useEffect(() => {
    const unlistens: Promise<() => void>[] = [];
    unlistens.push(
      listen<AcpModelOptions>(`chat://${sessionId}/acp_model_options`, (e) => {
        setAcpModelOptions(e.payload);
        const pending = pendingCrossAgentModelRef.current;
        if (pending && pending.agentId === lastResetAcpActiveIdRef.current) {
          pendingCrossAgentModelRef.current = null;
          setAcpModelChoice(pending.model);
          setAcpModelSwitchPending(false);
        }
      }),
    );
    // Safety net for `acpModelSwitchPending`: a spawn failure or crashed
    // subprocess means the connection this was waiting on is never coming,
    // so there's nothing left to spin on.
    unlistens.push(
      listen(`chat://${sessionId}/error`, () => {
        pendingCrossAgentModelRef.current = null;
        setAcpModelSwitchPending(false);
      }),
    );
    unlistens.push(
      listen<AcpEffortOptions>(
        `chat://${sessionId}/acp_effort_options`,
        (e) => {
          setAcpEffortOptions(e.payload);
        },
      ),
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

  const selectedModel = (ollamaModelsByConfig[providerActiveId] ?? []).find(
    (m) => m.name === model,
  );
  const contextLength = selectedModel?.contextLength ?? null;

  // Providers and ACP agents are both just "who answers this chat" from the
  // user's point of view, so they share one picker instead of a hard
  // `isAcp` fork — picking any option here can flip this conversation's own
  // `kind` as a side effect. Each Ollama config's own models are listed
  // individually (one entry per model, mirroring the ACP `flatMap` just
  // below), and so are an ACP agent's — using its cached model list (see
  // `useAcpAgentCatalog`/`fetchAcpModelsFor`) when one's known, falling
  // back to a single bare-config/bare-agent row otherwise (unfetched yet,
  // or nothing to pick from). Every row also carries a `section` — one per
  // provider config/ACP agent, not per backend kind — so
  // `ModelPickerPopover` can render "GitHub Copilot" as its own heading
  // with just its models under it, same for "Claude Code", each Ollama
  // connection, etc., instead of one flat list.
  const backendOptions: PickerOption[] = [
    ...providerSettings.ollama.filter(isEnabled).flatMap((c) => {
      const configModels = ollamaModelsByConfig[c.id] ?? [];
      if (configModels.length > 0) {
        return configModels.map((m) => ({
          key: `ollama:${c.id}:${m.name}`,
          label: m.name,
          subtitle: "Ollama",
          section: c.label,
        }));
      }
      return [
        {
          key: `ollama:${c.id}`,
          label: c.label,
          subtitle: c.host || "localhost:11434",
          section: c.label,
        },
      ];
    }),
    ...providerSettings.openAiCompatible.filter(isEnabled).map((c) => ({
      key: `openai:${c.id}`,
      label: c.label,
      subtitle: c.baseUrl || "OpenAI-compatible",
      section: c.label,
    })),
    ...agentBackend.acpAgents.filter(isEnabled).flatMap((c) => {
      // Prefer the Rust-cached catalog (available for every saved agent,
      // not just the one this conversation has active), but fall back to
      // the *live* connection's own options for whichever agent this
      // conversation is actually connected to right now — that's strictly
      // fresher, and covers the rare case where the cached fetch failed but
      // a real chat still succeeded.
      const known =
        (acpCatalog.find((e) => e.id === c.id)?.modelOptions as
          | AcpModelOptions
          | null
          | undefined) ?? (c.id === acpActiveId ? acpModelOptions : null);
      if (known && known.options.length > 0) {
        return known.options.map((o) => ({
          key: `acp:${c.id}:${o.value}`,
          label: o.name,
          subtitle: "ACP",
          section: c.label,
        }));
      }
      return [
        {
          key: `acp:${c.id}`,
          label: c.label,
          subtitle: "ACP agent",
          section: c.label,
        },
      ];
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
      ? (
          acpCatalog.find((e) => e.id === activeAcpAgent.id)?.modelOptions as
            | AcpModelOptions
            | null
            | undefined
        )?.currentValue
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
        ? `ollama:${providerActiveId}:${model}`
        : `ollama:${providerActiveId}`;
  const activeBackendLabel = isAcp
    ? // A chosen model's friendly name comes from `backendOptions`, built
      // from the Rust-cached catalog/live `acpModelOptions` — but that
      // cache can still be loading (or have failed to load) right after
      // switching to this conversation, before it's had a chance to
      // resolve. In that window, fall back to the raw model value rather
      // than the agent's
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
        // See `pendingCrossAgentModelRef`'s doc comment — the new agent
        // isn't connected yet, so this can't go into `acpModelChoice` until
        // its own `acp_model_options` event proves the connection is live.
        pendingCrossAgentModelRef.current = { agentId, model: modelValue };
        setAcpModelSwitchPending(true);
      } else if (modelValue) {
        setAcpModelChoice(modelValue);
      }
      setKind("acp");
      setAcpActiveId(agentId);
      // Also nudges the shared default, so a brand-new conversation opened
      // later starts from whatever was most recently picked anywhere.
      setDefaultBackend({ kind: "acp", acpId: agentId });
    } else if (key.startsWith("openai:")) {
      const id = key.slice("openai:".length);
      const config = providerSettings.openAiCompatible.find((c) => c.id === id);
      setKind("builtin");
      setProviderActiveId(id);
      setModel(config?.model ?? "");
      setDefaultBackend({ kind: "builtin", providerId: id });
    } else if (key.startsWith("ollama:")) {
      const rest = key.slice("ollama:".length);
      const sepIdx = rest.indexOf(":");
      const configId = sepIdx === -1 ? rest : rest.slice(0, sepIdx);
      const modelName = sepIdx === -1 ? null : rest.slice(sepIdx + 1);
      setKind("builtin");
      setProviderActiveId(configId);
      setDefaultBackend({ kind: "builtin", providerId: configId });
      if (modelName) {
        setModel(modelName);
        localStorage.setItem(LS_KEYS.lastModel, modelName);
      }
    }
  }

  // What the effort picker shows: the live connection's options when it has
  // reported in, else the catalog's cached ones for the active agent, so a
  // brand-new thread shows the picker immediately instead of after the
  // warmup handshake. Only the live options gate `selectAcpEffort`/the
  // apply-effect — a choice made against the cached list is sent once the
  // live event arrives.
  const displayedAcpEffortOptions: AcpEffortOptions | null =
    acpEffortOptions ??
    (isAcp && activeAcpAgent
      ? ((acpCatalog.find((e) => e.id === activeAcpAgent.id)?.effortOptions as
          | AcpEffortOptions
          | null
          | undefined) ?? null)
      : null);

  return {
    isAcp,
    isOpenAiCompatible,
    backendDisabled,
    backendDisabledReason,
    providerActiveId,
    activeAcpAgent,
    acpEffortOptions: displayedAcpEffortOptions,
    acpEffortChoice,
    acpCommands,
    model,
    setModel,
    contextLength,
    backendOptions,
    activeBackendKey,
    activeBackendLabel,
    acpModelSwitchPending,
    selectBackendOption,
    selectAcpEffort,
    resetAcpConnectionState,
  };
}

export type ChatSession = ReturnType<typeof useChatSession>;
