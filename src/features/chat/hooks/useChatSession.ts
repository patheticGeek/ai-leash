import { useEffect, useMemo, useRef, useState } from "react";
import {
  patchAcpSessionOptions,
  useAcpSessionOptions,
} from "../../../data/acpSessionOptions";
import {
  providerModelListing,
  providerUnreachableMessage,
  useProviderBackends,
  useProviderHealth,
  useProviderModels,
} from "../../../data/backends";
import { useAcpAgentCatalog } from "../../../lib/acpCatalogQuery";
import { LS_KEYS } from "../../../lib/localStorageKeys";
import {
  type AcpCommandInfo,
  type AcpEffortOptions,
  type AcpModelOptions,
  api,
} from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";
import { isEnabled } from "../../../store/backendSlice";
import { type ChatBackend, createChatBackend } from "../chatBackend";
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
const NO_COMMANDS: AcpCommandInfo[] = [];

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
  const providerSettings = useAppStore((s) => s.providerSettings);
  const providerBackends = useProviderBackends();
  const modelsByProvider = useProviderModels();
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
  const providerConfig = isAcp
    ? undefined
    : providerBackends.find((c) => c.id === providerActiveId);
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

  const [model, setModel] = useState(
    () => useAppStore.getState().conversationBackend[sessionId]?.model ?? "",
  );
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

  // What the live connection offers — Rust owns it (see
  // `data/acpSessionOptions.ts`). Only a connection to this conversation's
  // current agent counts: right after a switch the old one can still report.
  const launchCommand = isAcp ? activeAcpAgent?.launchCommand : undefined;
  const liveOptions = useAcpSessionOptions(sessionId);
  const live =
    launchCommand && liveOptions?.launchCommand === launchCommand
      ? liveOptions
      : null;
  const liveModelOptions = live?.model ?? null;
  const liveEffortOptions = live?.effort ?? null;
  const agentCommands = live?.commands ?? NO_COMMANDS;
  // A model is picked and the agent is still starting up — the picker shows
  // a spinner until it can be applied. A failed start drops the connection,
  // which ends this too.
  const modelSwitchPending = !!live && !live.ready && !!acpModelChoice;

  // Sends this conversation's remembered model/effort choice to the agent
  // once per connection (a fresh one after an agent switch, `/clear` or an
  // app restart starts on the agent's defaults), and again whenever the
  // choice changes. Tracked per connection rather than re-checked against
  // `currentValue` every time, so a change the agent makes itself (its own
  // `/model` command) isn't overridden.
  const appliedRef = useRef<{
    connection: number | null;
    model: string | null;
    effort: string | null;
  }>({ connection: null, model: null, effort: null });
  useEffect(() => {
    if (!live?.ready || live.connection === null) return;
    if (appliedRef.current.connection !== live.connection) {
      appliedRef.current = {
        connection: live.connection,
        model: null,
        effort: null,
      };
    }
    const applied = appliedRef.current;
    if (live.model && acpModelChoice && applied.model !== acpModelChoice) {
      applied.model = acpModelChoice;
      if (live.model.currentValue !== acpModelChoice) {
        const value = acpModelChoice;
        patchAcpSessionOptions(sessionId, (o) =>
          o.model ? { ...o, model: { ...o.model, currentValue: value } } : o,
        );
        api.setAcpModel(sessionId, value).catch((e) => setError(String(e)));
      }
    }
    if (live.effort && acpEffortChoice && applied.effort !== acpEffortChoice) {
      applied.effort = acpEffortChoice;
      if (live.effort.currentValue !== acpEffortChoice) {
        const value = acpEffortChoice;
        patchAcpSessionOptions(sessionId, (o) =>
          o.effort ? { ...o, effort: { ...o.effort, currentValue: value } } : o,
        );
        api.setAcpEffort(sessionId, value).catch((e) => setError(String(e)));
      }
    }
  }, [live, acpModelChoice, acpEffortChoice, sessionId, setError]);

  // A provider that lists its models has none yet the first time a
  // brand-new conversation opens on it — fill in a sensible one once this
  // conversation's active config's list loads. Conversations that already
  // have a `model` (from their own persisted choice, or from just having
  // picked one) are left alone.
  const listsModels =
    !!providerConfig && providerModelListing(providerConfig) === "live";
  useEffect(() => {
    if (!listsModels) return;
    const configModels = modelsByProvider[providerActiveId] ?? [];
    if (model || !configModels.length) return;
    const last = localStorage.getItem(LS_KEYS.lastModel);
    const restored =
      last && configModels.some((m) => m.name === last) ? last : null;
    setModel(restored ?? configModels[0].name);
  }, [modelsByProvider, providerActiveId, model, listsModels]);

  // This conversation's own active provider's reachability — checked per
  // provider (only while it is the one open), since which provider counts as
  // "active" is per-conversation.
  const connected = useProviderHealth(providerConfig);
  useEffect(() => {
    if (!providerConfig || backendDisabled) return;
    if (connected === false) {
      setError(providerUnreachableMessage(providerConfig));
    } else if (connected === true) {
      setError(null);
    }
  }, [connected, providerConfig, backendDisabled, setError]);

  const selectedModel = (modelsByProvider[providerActiveId] ?? []).find(
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
      const configModels = modelsByProvider[c.id] ?? [];
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
          | undefined) ?? (c.id === acpActiveId ? liveModelOptions : null);
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
    liveModelOptions?.currentValue ??
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
      // A different agent starts from its own defaults: whatever was picked
      // for the previous one doesn't carry over.
      if (agentId !== acpActiveId) {
        setAcpModelChoice(modelValue);
        setAcpEffortChoice(null);
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
  // warmup handshake. A choice made against the cached list is sent once the
  // connection is ready (the apply effect above).
  const backendKind = isAcp
    ? "acp"
    : isOpenAiCompatible
      ? "openAiCompatible"
      : "ollama";
  const providerConfigFor = useAppStore((s) => s.providerConfigFor);
  // Whoever answers this conversation — see `chatBackend.ts`. Everything
  // outside this hook uses it (and its `caps`) instead of branching on kind.
  const backend: ChatBackend = useMemo(
    () =>
      createChatBackend({
        kind: backendKind,
        model,
        provider: providerConfigFor(providerActiveId),
        launchCommand,
        disabled: backendDisabled,
      }),
    [
      backendKind,
      model,
      providerConfigFor,
      providerActiveId,
      launchCommand,
      backendDisabled,
    ],
  );

  const displayedEffortOptions: AcpEffortOptions | null =
    liveEffortOptions ??
    (isAcp && activeAcpAgent
      ? ((acpCatalog.find((e) => e.id === activeAcpAgent.id)?.effortOptions as
          | AcpEffortOptions
          | null
          | undefined) ?? null)
      : null);

  return {
    backend,
    backendDisabled,
    backendDisabledReason,
    providerActiveId,
    activeAcpAgent,
    // Only for a backend with an effort picker — a live options event from an
    // agent this conversation has since switched away from can linger.
    effortOptions: backend.caps.effortPicker ? displayedEffortOptions : null,
    effortChoice: acpEffortChoice,
    selectEffort: setAcpEffortChoice,
    agentCommands,
    model,
    setModel,
    contextLength,
    backendOptions,
    activeBackendKey,
    activeBackendLabel,
    modelSwitchPending,
    selectBackendOption,
  };
}

export type ChatSession = ReturnType<typeof useChatSession>;
