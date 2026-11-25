import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  Cpu,
  Lightbulb,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useBackendModels, useBackends } from "../../data/backends";
import { useAcpAgentCatalog } from "../../lib/acpCatalogQuery";
import type { AgentDefaults, ConversationSummary } from "../../lib/tauriApi";

// Stands for "unset: fall back to `inheritLabel`" as a real option, so the
// fallback shows by name instead of as an empty placeholder.
const UNSET = "unset";
const NATIVE_THINKING = ["low", "medium", "high"];
const ASK_BYPASS = [
  { value: "ask", name: "Ask" },
  { value: "bypass", name: "Bypass" },
];

function OptionSelect({
  label,
  value,
  onChange,
  unsetLabel,
  options,
  icon,
  disabled,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  unsetLabel: string;
  options: { value: string; name: string }[];
  icon: LucideIcon;
  disabled?: boolean;
}) {
  return (
    <Selector
      label={label}
      isLabelHidden
      variant="ghost"
      size="sm"
      startIcon={icon}
      value={value ?? UNSET}
      onChange={(v) => onChange(v === UNSET ? null : v)}
      isDisabled={disabled}
      options={[
        { value: UNSET, label: unsetLabel },
        ...(options.length > 0 ? [{ type: "divider" as const }] : []),
        ...options.map((o) => ({ value: o.value, label: o.name })),
      ]}
    />
  );
}

// Agent / model / thinking / permission pickers for an `AgentDefaults` —
// a task's (its dialog's rail), the board's (its settings) and the one a
// task is started with — as a MetadataList of label-less ghost Selectors,
// the work-item-detail template's rail rows. Unset parts read `inheritLabel` ("Board default", …).
// A model, thinking level and agent mode belong to the agent, so picking
// another agent clears them; with no agent picked they're left to the
// default too. An ACP agent with modes of its own picks one of those in
// place of Ask/Bypass, as the chat does.
export default function AgentFields({
  value,
  onChange,
  inheritLabel,
}: {
  value: AgentDefaults;
  onChange: (value: AgentDefaults) => void;
  inheritLabel: string;
}) {
  const backends = useBackends().filter(
    (b) => b.enabled || b.id === value.backendId,
  );
  const modelsByBackend = useBackendModels();
  const catalog = useAcpAgentCatalog();
  const backend = backends.find((b) => b.id === value.backendId);
  const acp =
    backend?.kind === "acp"
      ? catalog.find((c) => c.id === backend.id)
      : undefined;
  const agentDefault = backend?.kind === "acp" ? "Agent default" : "Default";

  const modelOptions =
    backend?.kind === "ollama"
      ? (modelsByBackend[backend.id] ?? []).map((m) => ({
          value: m.name,
          name: m.name,
        }))
      : (acp?.modelOptions?.options ?? []);
  const thinkingOptions =
    backend?.kind === "acp"
      ? (acp?.effortOptions?.options ?? [])
      : NATIVE_THINKING.map((t) => ({ value: t, name: t }));
  const modes = acp?.modeOptions?.options;

  const set = (patch: Partial<AgentDefaults>) =>
    onChange({ ...value, ...patch });

  return (
    <MetadataList>
      <MetadataListItem label="Agent">
        <OptionSelect
          label="Agent"
          icon={Cpu}
          value={value.backendId}
          unsetLabel={inheritLabel}
          options={backends.map((b) => ({ value: b.id, name: b.label }))}
          onChange={(backendId) =>
            onChange({
              backendId,
              model: null,
              thinking: null,
              agentMode: null,
              permissionMode: value.permissionMode,
            })
          }
        />
      </MetadataListItem>
      <MetadataListItem label="Model">
        {backend?.kind === "openAiCompatible" ? (
          <TextInput
            label="Model"
            isLabelHidden
            size="sm"
            width="100%"
            value={value.model ?? ""}
            onChange={(model) => set({ model: model || null })}
            placeholder={backend.model || "Model id"}
          />
        ) : (
          <OptionSelect
            label="Model"
            icon={Sparkles}
            value={value.model}
            unsetLabel={backend ? agentDefault : inheritLabel}
            options={modelOptions}
            disabled={!backend}
            onChange={(model) => set({ model })}
          />
        )}
      </MetadataListItem>
      <MetadataListItem label="Thinking">
        <OptionSelect
          label="Thinking"
          icon={Lightbulb}
          value={value.thinking}
          unsetLabel={backend ? agentDefault : inheritLabel}
          options={thinkingOptions}
          disabled={!backend || thinkingOptions.length === 0}
          onChange={(thinking) => set({ thinking })}
        />
      </MetadataListItem>
      <MetadataListItem label="Permission">
        {modes ? (
          <OptionSelect
            label="Permission"
            icon={ShieldCheck}
            value={value.agentMode}
            unsetLabel={agentDefault}
            options={modes.map((m) => ({ value: m.value, name: m.name }))}
            onChange={(agentMode) => set({ agentMode })}
          />
        ) : (
          <OptionSelect
            label="Permission"
            icon={ShieldCheck}
            value={value.permissionMode}
            unsetLabel={inheritLabel}
            options={ASK_BYPASS}
            onChange={(permissionMode) =>
              set({ permissionMode: permissionMode as "ask" | "bypass" | null })
            }
          />
        )}
      </MetadataListItem>
    </MetadataList>
  );
}

// What a started task's chat actually runs with — plain values in the same
// rows, since the agent is the chat's to change from here on.
export function AgentSummary({
  conversation,
}: {
  conversation: ConversationSummary | undefined;
}) {
  const backends = useBackends();
  const catalog = useAcpAgentCatalog();
  const backend = backends.find((b) => b.id === conversation?.backend);
  const acp = catalog.find((c) => c.id === backend?.id);
  const named = (
    value: string | null | undefined,
    options: { value: string; name: string }[] | undefined,
  ) => options?.find((o) => o.value === value)?.name ?? value;
  const permission = conversation?.agentMode
    ? named(conversation.agentMode, acp?.modeOptions?.options)
    : conversation?.permissionMode === "bypass"
      ? "Bypass"
      : "Ask";
  const rows: [string, string | null | undefined][] = [
    ["Agent", backend?.label ?? conversation?.backend],
    ["Model", named(conversation?.model, acp?.modelOptions?.options)],
    ["Thinking", named(conversation?.effort, acp?.effortOptions?.options)],
    ["Permission", permission],
  ];
  return (
    <MetadataList>
      {rows.map(([label, value]) => (
        <MetadataListItem key={label} label={label}>
          <Text color={value ? "primary" : "secondary"}>
            {value || "Default"}
          </Text>
        </MetadataListItem>
      ))}
    </MetadataList>
  );
}

// The agent a task starts with before the app-wide defaults: the task's
// own over the board's, the same way Rust's `board::lifecycle::
// resolve_agent` does it (without an explicit layer).
export function resolveAgent(
  task: AgentDefaults,
  board: AgentDefaults,
): AgentDefaults {
  const chooser = task.backendId ? task : board.backendId ? board : null;
  const pick = (key: "model" | "thinking" | "agentMode") =>
    chooser ? (chooser[key] ?? null) : (task[key] ?? board[key] ?? null);
  return {
    backendId: chooser?.backendId ?? null,
    model: pick("model"),
    thinking: pick("thinking"),
    agentMode: pick("agentMode"),
    permissionMode: task.permissionMode ?? board.permissionMode ?? null,
  };
}
