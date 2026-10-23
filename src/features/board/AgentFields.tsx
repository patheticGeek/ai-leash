import { Field, FieldLabel } from "@/ui/field";
import { Input } from "@/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { useBackendModels, useBackends } from "../../data/backends";
import { useAcpAgentCatalog } from "../../lib/acpCatalogQuery";
import type { AgentDefaults } from "../../lib/tauriApi";

// Radix `Select` reserves "" for "nothing selected", so this stands for
// "unset: fall back to `inheritLabel`".
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
  disabled,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  unsetLabel: string;
  options: { value: string; name: string }[];
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value ?? UNSET}
        onValueChange={(v) => onChange(v === UNSET ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET}>{unsetLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

// Agent / model / thinking / permission pickers for an `AgentDefaults` —
// a task's (in its dialog), the board's (its settings) and the one a task
// is started with. Unset parts read `inheritLabel` ("Board default", …).
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <OptionSelect
        label="Agent"
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
      {backend?.kind === "openAiCompatible" ? (
        <Field>
          <FieldLabel>Model</FieldLabel>
          <Input
            value={value.model ?? ""}
            onChange={(e) => set({ model: e.target.value || null })}
            placeholder={backend.model || "Model id"}
          />
        </Field>
      ) : (
        <OptionSelect
          label="Model"
          value={value.model}
          unsetLabel={backend ? agentDefault : inheritLabel}
          options={modelOptions}
          disabled={!backend}
          onChange={(model) => set({ model })}
        />
      )}
      <OptionSelect
        label="Thinking"
        value={value.thinking}
        unsetLabel={backend ? agentDefault : inheritLabel}
        options={thinkingOptions}
        disabled={!backend || thinkingOptions.length === 0}
        onChange={(thinking) => set({ thinking })}
      />
      {modes ? (
        <OptionSelect
          label="Permission"
          value={value.agentMode}
          unsetLabel={agentDefault}
          options={modes.map((m) => ({ value: m.value, name: m.name }))}
          onChange={(agentMode) => set({ agentMode })}
        />
      ) : (
        <OptionSelect
          label="Permission"
          value={value.permissionMode}
          unsetLabel={inheritLabel}
          options={ASK_BYPASS}
          onChange={(permissionMode) =>
            set({ permissionMode: permissionMode as "ask" | "bypass" | null })
          }
        />
      )}
    </div>
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
