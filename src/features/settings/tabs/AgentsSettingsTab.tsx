// Agents: every configured backend as a settings row — external ACP agents in
// one card, the built-in providers (Ollama, OpenAI-compatible) in another.
// Each row has an on/off Switch and a MoreMenu (Make default, Edit, Delete);
// the default agent carries a "Default" token. "Add an agent" is a menu of the
// three kinds; Add and Edit swap the panel for that kind's form. Which loop a
// backend runs on is otherwise not shown — to the user each is "an agent",
// the same framing the chat bar's picker uses.
import { Button } from "@astryxdesign/core/Button";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon, type IconType } from "@astryxdesign/core/Icon";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import {
  Box,
  Cloud,
  KeyRound,
  Link,
  Plus,
  Server,
  SquareTerminal,
  Tag,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  deleteBackend,
  saveBackend,
  setDefaultBackend,
  useBackends,
  useDefaultBackendId,
  useKeyStorageError,
} from "../../../data/backends";
import { isEdited } from "../../../hooks/useDiscardGuard";
import type { BackendConfig } from "../../../lib/tauriApi";
import { SettingsCard, SettingsRow } from "../SettingsCard";

type Kind = BackendConfig["kind"];

const KIND_META: Record<Kind, { icon: IconType; label: string; hint: string }> =
  {
    acp: {
      icon: SquareTerminal,
      label: "ACP agent",
      hint: "An external agent over the Agent Client Protocol",
    },
    ollama: {
      icon: Server,
      label: "Ollama",
      hint: "A local or remote Ollama server",
    },
    openAiCompatible: {
      icon: Cloud,
      label: "OpenAI-compatible API",
      hint: "Any chat-completions-compatible endpoint",
    },
  };

const emptyOllamaForm = { label: "", host: "" };
const emptyOpenAiForm = { label: "", baseUrl: "", apiKey: "", model: "" };
const emptyAcpForm = { label: "", launchCommand: "" };

// The list, or one kind's form (Add — `id: null` — or Edit).
type View = { step: "list" } | { step: "form"; kind: Kind; id: string | null };

function subtitle(config: BackendConfig): string {
  const where =
    config.kind === "ollama"
      ? config.host || "localhost:11434"
      : config.kind === "acp"
        ? config.launchCommand
        : config.baseUrl;
  return config.enabled ? where : `${where} · turned off`;
}

/** One full-width field of an Add / Edit form, as a settings row. */
function FieldRow({
  title,
  description,
  icon,
  input,
}: {
  title: string;
  description?: ReactNode;
  icon: IconType;
  input: ReactNode;
}) {
  return (
    <SettingsRow
      title={title}
      description={description}
      icon={icon}
      detail={input}
    />
  );
}

export default function AgentsSettingsTab({
  onDirtyChange,
}: {
  // Whether the Add / Edit form holds input that Save hasn't stored.
  onDirtyChange: (dirty: boolean) => void;
}) {
  const backends = useBackends();
  const defaultBackendId = useDefaultBackendId();
  const keyStorageError = useKeyStorageError();

  const [view, setView] = useState<View>({ step: "list" });
  const [ollamaForm, setOllamaForm] = useState(emptyOllamaForm);
  const [openAiForm, setOpenAiForm] = useState(emptyOpenAiForm);
  const [acpForm, setAcpForm] = useState(emptyAcpForm);
  // The form as it opened, so only a real change counts as unsaved.
  const [formStart, setFormStart] = useState<unknown>(null);

  const currentForm =
    view.step !== "form"
      ? null
      : view.kind === "ollama"
        ? ollamaForm
        : view.kind === "openAiCompatible"
          ? openAiForm
          : acpForm;
  const dirty = currentForm !== null && isEdited(formStart, currentForm);
  // biome-ignore lint/correctness/useExhaustiveDependencies: onDirtyChange is a state setter
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on unmount only
  useEffect(() => () => onDirtyChange(false), []);

  function startAdd(kind: Kind) {
    if (kind === "ollama") setOllamaForm(emptyOllamaForm);
    if (kind === "openAiCompatible") setOpenAiForm(emptyOpenAiForm);
    if (kind === "acp") setAcpForm(emptyAcpForm);
    setFormStart(
      kind === "ollama"
        ? emptyOllamaForm
        : kind === "openAiCompatible"
          ? emptyOpenAiForm
          : emptyAcpForm,
    );
    setView({ step: "form", kind, id: null });
  }

  function startEdit(config: BackendConfig) {
    if (config.kind === "ollama") {
      const form = { label: config.label, host: config.host };
      setOllamaForm(form);
      setFormStart(form);
    } else if (config.kind === "openAiCompatible") {
      const form = {
        label: config.label,
        baseUrl: config.baseUrl,
        // Never comes back from Rust — blank keeps the saved one.
        apiKey: "",
        model: config.model,
      };
      setOpenAiForm(form);
      setFormStart(form);
    } else {
      const form = { label: config.label, launchCommand: config.launchCommand };
      setAcpForm(form);
      setFormStart(form);
    }
    setView({ step: "form", kind: config.kind, id: config.id });
  }

  function saveForm() {
    if (view.step !== "form") return;
    const { kind } = view;
    const existing = backends.find((b) => b.id === view.id);
    const base = {
      id: view.id ?? crypto.randomUUID(),
      enabled: existing?.enabled ?? true,
    };
    if (kind === "ollama") {
      if (!ollamaForm.label.trim() || !ollamaForm.host.trim()) return;
      void saveBackend({
        ...base,
        kind: "ollama",
        label: ollamaForm.label.trim(),
        host: ollamaForm.host.trim(),
        model: existing?.kind === "ollama" ? existing.model : "",
      });
    } else if (kind === "openAiCompatible") {
      if (!openAiForm.label.trim() || !openAiForm.baseUrl.trim()) return;
      void saveBackend({
        ...base,
        kind: "openAiCompatible",
        label: openAiForm.label.trim(),
        baseUrl: openAiForm.baseUrl.trim(),
        apiKey: openAiForm.apiKey.trim(),
        apiKeySaved: false,
        model: openAiForm.model.trim(),
      });
    } else {
      if (!acpForm.label.trim() || !acpForm.launchCommand.trim()) return;
      void saveBackend({
        ...base,
        kind: "acp",
        label: acpForm.label.trim(),
        launchCommand: acpForm.launchCommand.trim(),
      });
    }
    setView({ step: "list" });
  }

  if (view.step === "form") {
    const { kind, id } = view;
    const editing = backends.find((b) => b.id === id);
    const input = (
      label: string,
      value: string,
      onChange: (v: string) => void,
      placeholder: string,
      extra?: { type?: "password" },
    ) => (
      <TextInput
        label={label}
        isLabelHidden
        size="sm"
        width="100%"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        hasSpellCheck={false}
        autoComplete="off"
        {...extra}
      />
    );
    let rows: ReactNode;
    if (kind === "ollama") {
      rows = [
        <FieldRow
          key="label"
          title="Name"
          icon={Tag}
          input={input(
            "Name",
            ollamaForm.label,
            (label) => setOllamaForm({ ...ollamaForm, label }),
            "Local Ollama",
          )}
        />,
        <FieldRow
          key="host"
          title="Host"
          icon={Link}
          input={input(
            "Host",
            ollamaForm.host,
            (host) => setOllamaForm({ ...ollamaForm, host }),
            "localhost:11434",
          )}
        />,
      ];
    } else if (kind === "openAiCompatible") {
      rows = [
        <FieldRow
          key="label"
          title="Name"
          icon={Tag}
          input={input(
            "Name",
            openAiForm.label,
            (label) => setOpenAiForm({ ...openAiForm, label }),
            "OpenRouter",
          )}
        />,
        <FieldRow
          key="baseUrl"
          title="Base URL"
          icon={Link}
          input={input(
            "Base URL",
            openAiForm.baseUrl,
            (baseUrl) => setOpenAiForm({ ...openAiForm, baseUrl }),
            "https://api.openai.com/v1",
          )}
        />,
        <FieldRow
          key="apiKey"
          title="API key"
          icon={KeyRound}
          description={
            keyStorageError
              ? `Couldn't use the system keychain (${keyStorageError}), so API keys are stored unencrypted in this app's settings file.`
              : "Stored in the system keychain."
          }
          input={input(
            "API key",
            openAiForm.apiKey,
            (apiKey) => setOpenAiForm({ ...openAiForm, apiKey }),
            editing?.kind === "openAiCompatible" && editing.apiKeySaved
              ? "Saved — leave blank to keep it"
              : "API key",
            { type: "password" },
          )}
        />,
        <FieldRow
          key="model"
          title="Model"
          icon={Box}
          input={input(
            "Model",
            openAiForm.model,
            (model) => setOpenAiForm({ ...openAiForm, model }),
            "gpt-4.1",
          )}
        />,
      ];
    } else {
      rows = [
        <FieldRow
          key="label"
          title="Name"
          icon={Tag}
          input={input(
            "Name",
            acpForm.label,
            (label) => setAcpForm({ ...acpForm, label }),
            "Claude Code",
          )}
        />,
        <FieldRow
          key="launchCommand"
          title="Launch command"
          icon={SquareTerminal}
          description="Runs as an external agent process. If it advertises a model list, the chat bar shows it once a conversation using it starts."
          input={input(
            "Launch command",
            acpForm.launchCommand,
            (launchCommand) => setAcpForm({ ...acpForm, launchCommand }),
            "npx -y @agentclientprotocol/claude-agent-acp@latest",
          )}
        />,
      ];
    }
    return (
      <VStack gap={5}>
        <SettingsCard title={`${id ? "Edit" : "Add"} ${KIND_META[kind].label}`}>
          {rows}
        </SettingsCard>
        <HStack gap={2} justify="end">
          <Button
            variant="ghost"
            label="Cancel"
            onClick={() => setView({ step: "list" })}
          />
          <Button variant="primary" label="Save" onClick={saveForm} />
        </HStack>
      </VStack>
    );
  }

  const agentRow = (c: BackendConfig) => {
    const isDefault = c.enabled && c.id === defaultBackendId;
    return (
      <SettingsRow
        key={c.id}
        title={c.label}
        titleAccessory={isDefault ? <Token size="sm" label="Default" /> : null}
        icon={KIND_META[c.kind].icon}
        description={subtitle(c)}
        control={
          <HStack gap={2} vAlign="center">
            <Switch
              label={`Turn ${c.label} on`}
              isLabelHidden
              value={c.enabled}
              onChange={(enabled) => void saveBackend({ ...c, enabled })}
            />
            <MoreMenu
              size="sm"
              label={`${c.label} options`}
              items={[
                ...(c.enabled && !isDefault
                  ? [
                      {
                        label: "Make default",
                        onClick: () => void setDefaultBackend(c.id),
                      },
                    ]
                  : []),
                { label: "Edit", onClick: () => startEdit(c) },
                { type: "divider" as const },
                {
                  label: "Delete",
                  variant: "destructive" as const,
                  onClick: () => void deleteBackend(c.id),
                },
              ]}
            />
          </HStack>
        }
      />
    );
  };

  const acp = backends.filter((b) => b.kind === "acp");
  // Ollama connections first, then OpenAI-compatible APIs.
  const providers = backends
    .filter((b) => b.kind !== "acp")
    .sort((a, b) => Number(a.kind !== "ollama") - Number(b.kind !== "ollama"));

  return (
    <VStack gap={5}>
      {acp.length > 0 && (
        <SettingsCard title="External agents (ACP)">
          {acp.map(agentRow)}
        </SettingsCard>
      )}
      {providers.length > 0 && (
        <SettingsCard title="Built-in providers">
          {providers.map(agentRow)}
        </SettingsCard>
      )}
      <HStack>
        <DropdownMenu
          button={{
            label: "Add an agent",
            icon: <Icon icon={Plus} size="sm" />,
          }}
          items={(Object.keys(KIND_META) as Kind[]).map((kind) => ({
            label: KIND_META[kind].label,
            description: KIND_META[kind].hint,
            icon: <Icon icon={KIND_META[kind].icon} size="sm" />,
            onClick: () => startAdd(kind),
          }))}
        />
      </HStack>
      <Text type="supporting" color="secondary">
        The default agent is the one new conversations start with; each
        conversation remembers its own once you pick one from the chat bar. A
        turned-off agent stays saved but is hidden from the chat bar and no
        longer checked in the background.
      </Text>
    </VStack>
  );
}
