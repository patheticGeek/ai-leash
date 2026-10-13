import { useEffect, useMemo, useRef, useState } from "react";
import {
  patchAcpSessionOptions,
  useAcpSessionOptions,
} from "../../../data/acpSessionOptions";
import {
  BACKEND_CAPABILITIES,
  getRegistry,
  setDefaultBackend,
  unreachableMessage,
  useBackendHealth,
  useBackendModels,
  useBackends,
} from "../../../data/backends";
import { useAcpAgentCatalog } from "../../../lib/acpCatalogQuery";
import {
  type AcpCommandInfo,
  type AcpEffortOptions,
  api,
  type BackendConfig,
} from "../../../lib/tauriApi";
import { type ConversationBackendSelection, useAppStore } from "../../../store";
import { type ChatBackend, createChatBackend } from "../chatBackend";
import type { PickerOption } from "../components/popovers/ModelPickerPopover";

// Commands we handle ourselves, client-side, rather than sending as a
// prompt — no ACP agent implements a matching request (the protocol
// doesn't define one), so these exist purely as local UI bookkeeping.
// Listed alongside whatever the connected agent advertises (see
// `agentCommands`) so they show up in the same autocomplete popover; a
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

// Only offered for a backend that can summarize (`caps.compaction`) — an
// ACP agent's real context lives inside its own subprocess, so there's
// nothing to compact from out here, and some agents implement a genuine
// "/compact" of their own that intercepting the name locally would
// otherwise shadow. Kept separate from `LOCAL_COMMANDS` so an
// agent-advertised "/compact" passes straight through as a normal prompt.
export const COMPACT_COMMAND: AcpCommandInfo = {
  name: "compact",
  description: "Summarize this conversation to reclaim context",
  hint: null,
};

const NO_COMMANDS: AcpCommandInfo[] = [];

// A picker row's key: the backend and (optionally) one of its models.
// JSON so neither part needs escaping.
function optionKey(backendId: string, model: string | null): string {
  return JSON.stringify([backendId, model]);
}

function parseOptionKey(key: string): [string, string | null] {
  return JSON.parse(key);
}

// The model a native backend starts with: the one last used on it.
function rememberedModel(config: BackendConfig | undefined): string {
  return config && config.kind !== "acp" ? config.model : "";
}

// A new conversation starts on the registry's default backend.
function initialSelection(sessionId: string): ConversationBackendSelection {
  const saved = useAppStore.getState().conversationBackend[sessionId];
  if (saved) return saved;
  const { backends, defaultBackendId } = getRegistry();
  return {
    backendId: defaultBackendId,
    model: rememberedModel(backends.find((b) => b.id === defaultBackendId)),
    effort: null,
  };
}

// Owns "who answers this chat" for one conversation: which backend, which
// model and effort there, and persisting that choice per conversation. See
// `docs/features/agent-chat.md` for what "backend" means here.
export function useChatSession(
  sessionId: string,
  setError: (message: string | null) => void,
) {
  const backends = useBackends();
  const modelsByBackend = useBackendModels();
  // Rust-owned catalog of discovered ACP models/effort levels.
  const acpCatalog = useAcpAgentCatalog();
  const setConversationBackend = useAppStore((s) => s.setConversationBackend);

  // Read once at mount (this component remounts per conversation, via
  // `App.tsx`'s `key={activeSessionId}`), then this conversation's own
  // source of truth — picking something here never changes another one.
  const [selection, setSelection] = useState(() => initialSelection(sessionId));
  const { backendId, model, effort } = selection;
  const config = backends.find((b) => b.id === backendId);
  const caps = BACKEND_CAPABILITIES[config?.kind ?? "ollama"];

  useEffect(() => {
    setConversationBackend(sessionId, selection);
  }, [sessionId, selection, setConversationBackend]);

  // Its backend was deleted or switched off in Settings > Agents after it
  // was picked — it stays selected (nothing silently swaps it), but nothing
  // may be sent until it's back or another one is picked.
  const backendDisabledReason = !config
    ? "This conversation's agent was deleted in Settings > Agents. Pick another one from the chat bar."
    : !config.enabled
      ? `${config.label} is turned off in Settings > Agents. Turn it back on, or pick another agent from the chat bar.`
      : null;
  useEffect(() => {
    if (!backendDisabledReason) return;
    setError(backendDisabledReason);
    return () => setError(null);
  }, [backendDisabledReason, setError]);

  // Reachability, for a backend that's checked (`caps.healthCheck`).
  const connected = useBackendHealth(config);
  useEffect(() => {
    if (!config || backendDisabledReason || connected === null) return;
    setError(connected ? null : unreachableMessage(config));
  }, [connected, config, backendDisabledReason, setError]);

  // A backend that lists its models may have no model picked yet (a new
  // conversation on a backend nothing was ever used on) — fill one in once
  // the list loads: the one last used there if it's still offered, else the
  // first.
  const listedModels = modelsByBackend[backendId];
  useEffect(() => {
    if (model || !listedModels?.length) return;
    const last = rememberedModel(config);
    const pick = listedModels.some((m) => m.name === last)
      ? last
      : listedModels[0].name;
    setSelection((s) => ({ ...s, model: pick }));
  }, [listedModels, model, config]);

  const contextLength =
    listedModels?.find((m) => m.name === model)?.contextLength ?? null;

  // What the live connection offers — Rust owns it (see
  // `data/acpSessionOptions.ts`). Only a connection to this conversation's
  // current agent counts: right after a switch the old one can still report.
  const launchCommand = config?.kind === "acp" ? config.launchCommand : null;
  const liveOptions = useAcpSessionOptions(sessionId);
  const live =
    launchCommand && liveOptions?.launchCommand === launchCommand
      ? liveOptions
      : null;
  const catalogEntry = acpCatalog.find((e) => e.id === backendId);
  const agentCommands = live?.commands ?? NO_COMMANDS;
  // A model is picked and the agent is still starting up — the picker shows
  // a spinner until it can be applied. A failed start drops the connection,
  // which ends this too.
  const modelSwitchPending = !!live && !live.ready && !!model;

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
    if (live.model && model && applied.model !== model) {
      applied.model = model;
      if (live.model.currentValue !== model) {
        patchAcpSessionOptions(sessionId, (o) =>
          o.model ? { ...o, model: { ...o.model, currentValue: model } } : o,
        );
        api.setSessionModel(sessionId, model).catch((e) => setError(String(e)));
      }
    }
    if (live.effort && effort && applied.effort !== effort) {
      applied.effort = effort;
      if (live.effort.currentValue !== effort) {
        patchAcpSessionOptions(sessionId, (o) =>
          o.effort
            ? { ...o, effort: { ...o.effort, currentValue: effort } }
            : o,
        );
        api
          .setSessionEffort(sessionId, effort)
          .catch((e) => setError(String(e)));
      }
    }
  }, [live, model, effort, sessionId, setError]);

  // Every enabled backend in one picker, grouped by backend (`section`):
  // one row per model where its models are known — an Ollama connection's
  // live list, an ACP agent's cached catalog (or, for the agent this
  // conversation is connected to, its live options) — else one bare row
  // for the backend itself.
  const backendOptions: PickerOption[] = backends
    .filter((b) => b.enabled)
    .flatMap((b) => {
      const models =
        b.kind === "acp"
          ? (
              acpCatalog.find((e) => e.id === b.id)?.modelOptions ??
              (b.id === backendId ? live?.model : null)
            )?.options.map((o) => ({ value: o.value, name: o.name }))
          : modelsByBackend[b.id]?.map((m) => ({
              value: m.name,
              name: m.name,
            }));
      const subtitle =
        b.kind === "ollama" ? "Ollama" : b.kind === "acp" ? "ACP" : "API";
      if (models?.length) {
        return models.map((m) => ({
          key: optionKey(b.id, m.value),
          label: m.name,
          subtitle,
          section: b.label,
        }));
      }
      return [
        {
          key: optionKey(b.id, null),
          label: b.label,
          subtitle:
            b.kind === "ollama"
              ? b.host || "localhost:11434"
              : b.kind === "acp"
                ? "ACP agent"
                : b.baseUrl || "OpenAI-compatible",
          section: b.label,
        },
      ];
    });

  // The model shown as picked: the conversation's own choice, else what the
  // live connection or the catalog reports as the agent's default — so a
  // conversation that never chose one shows the real default, not the
  // agent's name as if it were a model.
  const shownModel =
    model ||
    live?.model?.currentValue ||
    catalogEntry?.modelOptions?.currentValue ||
    "";
  const candidateKey = optionKey(backendId, shownModel || null);
  const activeBackendKey = config
    ? backendOptions.some((o) => o.key === candidateKey)
      ? candidateKey
      : optionKey(backendId, null)
    : null;
  const activeBackendLabel = !config
    ? "select agent"
    : caps.freeTextModel
      ? config.label
      : // The option's friendly name, else the raw value while the catalog
        // loads — never the backend's own label as if it were the model.
        (backendOptions.find((o) => o.key === candidateKey)?.label ??
        (shownModel || (caps.ownsAgentLoop ? config.label : "select model")));

  function selectBackendOption(key: string) {
    const [id, pickedModel] = parseOptionKey(key);
    const target = backends.find((b) => b.id === id);
    if (id !== backendId) {
      // Another backend starts from its own remembered model (or the one
      // picked) and default effort — the previous one's don't carry over.
      setSelection({
        backendId: id,
        model: pickedModel ?? rememberedModel(target),
        effort: null,
      });
    } else if (pickedModel !== null) {
      setSelection((s) => ({ ...s, model: pickedModel }));
    }
    // A brand-new conversation opened later starts from whatever was most
    // recently picked anywhere.
    void setDefaultBackend(id);
  }

  // Whoever answers this conversation — see `chatBackend.ts`. Everything
  // outside this hook uses it (and its `caps`) instead of branching on kind.
  const backend: ChatBackend = useMemo(
    () => createChatBackend(config, model, effort),
    [config, model, effort],
  );

  // What the effort picker shows: the live connection's options when it has
  // reported in, else the catalog's cached ones, so a brand-new thread shows
  // the picker immediately instead of after the warmup handshake. A choice
  // made against the cached list is sent once the connection is ready (the
  // apply effect above).
  const effortOptions: AcpEffortOptions | null = caps.effortPicker
    ? (live?.effort ?? catalogEntry?.effortOptions ?? null)
    : null;

  return {
    backend,
    backendConfig: config,
    backendDisabledReason,
    effortOptions,
    effortChoice: effort,
    selectEffort: (value: string) =>
      setSelection((s) => ({ ...s, effort: value })),
    agentCommands,
    model,
    // The free-text model box (`caps.freeTextModel`).
    setModel: (value: string) => setSelection((s) => ({ ...s, model: value })),
    contextLength,
    backendOptions,
    activeBackendKey,
    activeBackendLabel,
    modelSwitchPending,
    selectBackendOption,
  };
}

export type ChatSession = ReturnType<typeof useChatSession>;
