import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import {
  Bot,
  Check,
  Cloud,
  Pencil,
  Plus,
  Server,
  Trash2,
  X,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useState } from "react";
import {
  deleteBackend,
  saveBackend,
  setDefaultBackend,
  useBackends,
  useDefaultBackendId,
  useKeyStorageError,
} from "../../../data/backends";
import type { BackendConfig } from "../../../lib/tauriApi";
import { Hint, SectionHeading, SettingsSection } from "./SettingsParts";

const ring = (color: string) =>
  `0 0 0 ${borderVars["--border-width"]} ${color}`;

const styles = stylex.create({
  // An agent card: a tinted, rounded, borderless row on the dialog surface.
  card: {
    backgroundColor: colorVars["--color-background-muted"],
    borderColor: "transparent",
    borderRadius: radiusVars["--radius-element"],
  },
  // The default agent: an accent ring over a faint accent tint.
  cardDefault: {
    backgroundColor: `color-mix(in srgb, ${colorVars["--color-accent"]} 10%, ${colorVars["--color-background-muted"]})`,
    boxShadow: ring(colorVars["--color-accent"]),
  },
  // A turned-off agent stays listed (and its controls live), just dimmed.
  cardOff: { opacity: 0.6 },
  warning: { color: colorVars["--color-text-warning"] },
  // The open Add/Edit form: a tinted block with an accent ring.
  form: {
    backgroundColor: colorVars["--color-background-muted"],
    borderRadius: radiusVars["--radius-element"],
    boxShadow: ring(colorVars["--color-accent"]),
    padding: spacingVars["--spacing-3"],
  },
  // The "Add" tile: a dashed outline that brightens on hover.
  addTile: {
    backgroundColor: "transparent",
    borderStyle: "dashed",
    borderWidth: borderVars["--border-width"],
    borderColor: {
      default: colorVars["--color-border-emphasized"],
      ":hover": colorVars["--color-text-secondary"],
    },
    borderRadius: radiusVars["--radius-element"],
    color: {
      default: colorVars["--color-text-secondary"],
      ":hover": colorVars["--color-text-primary"],
    },
  },
});

// One flat grid of every configured backend — Ollama connections, ACP
// agents, then OpenAI-compatible APIs — matching what the user asked for
// ("claude, copilot, ollama" as one set of default cards, not three
// separate sections). Which underlying loop a card runs on (this app's own
// tool loop vs. an external ACP subprocess) is never shown here — a card is
// just "an agent", same framing `useChatSession.ts`'s chat-bar picker
// already uses.
type CardType = BackendConfig["kind"];

const TYPE_META: Record<
  CardType,
  {
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    label: string;
    hint: string;
  }
> = {
  ollama: {
    icon: Server,
    label: "Ollama",
    hint: "Connect to a local or remote Ollama server",
  },
  acp: {
    icon: Bot,
    label: "ACP agent",
    hint: "Launch an external agent over the Agent Client Protocol",
  },
  openAiCompatible: {
    icon: Cloud,
    label: "OpenAI-compatible API",
    hint: "Any OpenAI chat-completions-compatible endpoint",
  },
};

const emptyOllamaForm = { label: "", host: "" };
const emptyOpenAiForm = { label: "", baseUrl: "", apiKey: "", model: "" };
const emptyAcpForm = { label: "", launchCommand: "" };

// Where the tab is: the card grid, the "pick a type" step of Add, or a
// type's form (shared by Add — `id: null` — and Edit — `id` set).
type View =
  | { step: "grid" }
  | { step: "pickType" }
  | { step: "form"; type: CardType; id: string | null };

export default function AgentsSettingsTab() {
  const backends = useBackends();
  const defaultBackendId = useDefaultBackendId();
  const keyStorageError = useKeyStorageError();

  const [view, setView] = useState<View>({ step: "grid" });
  const [ollamaForm, setOllamaForm] = useState(emptyOllamaForm);
  const [openAiForm, setOpenAiForm] = useState(emptyOpenAiForm);
  const [acpForm, setAcpForm] = useState(emptyAcpForm);

  function startAdd(type: CardType) {
    if (type === "ollama") setOllamaForm(emptyOllamaForm);
    if (type === "openAiCompatible") setOpenAiForm(emptyOpenAiForm);
    if (type === "acp") setAcpForm(emptyAcpForm);
    setView({ step: "form", type, id: null });
  }

  function startEdit(config: BackendConfig) {
    if (config.kind === "ollama") {
      setOllamaForm({ label: config.label, host: config.host });
    } else if (config.kind === "openAiCompatible") {
      setOpenAiForm({
        label: config.label,
        baseUrl: config.baseUrl,
        // Never comes back from Rust — blank keeps the saved one.
        apiKey: "",
        model: config.model,
      });
    } else {
      setAcpForm({ label: config.label, launchCommand: config.launchCommand });
    }
    setView({ step: "form", type: config.kind, id: config.id });
  }

  function saveForm() {
    if (view.step !== "form") return;
    const { type } = view;
    const existing = backends.find((b) => b.id === view.id);
    const base = {
      id: view.id ?? crypto.randomUUID(),
      enabled: existing?.enabled ?? true,
    };
    if (type === "ollama") {
      if (!ollamaForm.label.trim() || !ollamaForm.host.trim()) return;
      void saveBackend({
        ...base,
        kind: "ollama",
        label: ollamaForm.label.trim(),
        host: ollamaForm.host.trim(),
        model: existing?.kind === "ollama" ? existing.model : "",
      });
    } else if (type === "openAiCompatible") {
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
    setView({ step: "grid" });
  }

  // Ollama connections, then ACP agents, then OpenAI-compatible APIs.
  const order: Record<CardType, number> = {
    ollama: 0,
    acp: 1,
    openAiCompatible: 2,
  };
  const cards = [...backends].sort((a, b) => order[a.kind] - order[b.kind]);

  function subtitle(config: BackendConfig): string {
    if (config.kind === "ollama") return config.host || "localhost:11434";
    if (config.kind === "acp") return config.launchCommand;
    return config.baseUrl;
  }

  // The Cancel / Save pair under every form.
  const formButtons = (
    <HStack gap={2} justify="end">
      <Button
        variant="ghost"
        label="Cancel"
        icon={<X size={14} />}
        onClick={() => setView({ step: "grid" })}
      />
      <Button
        variant="primary"
        label="Save"
        icon={<Check size={14} />}
        onClick={saveForm}
      />
    </HStack>
  );

  if (view.step === "pickType") {
    return (
      <SettingsSection
        title="Add a backend"
        actions={
          <Button
            variant="ghost"
            size="sm"
            label="Cancel"
            icon={<X size={14} />}
            onClick={() => setView({ step: "grid" })}
          />
        }
      >
        <VStack gap={3}>
          {(Object.keys(TYPE_META) as CardType[]).map((type) => {
            const meta = TYPE_META[type];
            return (
              <ClickableCard
                key={type}
                label={meta.label}
                variant="muted"
                padding={3}
                onClick={() => startAdd(type)}
                xstyle={styles.card}
              >
                <VStack gap={1}>
                  <HStack gap={2} vAlign="center">
                    <Icon icon={meta.icon} size="sm" color="secondary" />
                    <Text>{meta.label}</Text>
                  </HStack>
                  <Text size="sm" color="secondary">
                    {meta.hint}
                  </Text>
                </VStack>
              </ClickableCard>
            );
          })}
        </VStack>
      </SettingsSection>
    );
  }

  if (view.step === "form") {
    const { type, id } = view;
    const editingOpenAi = backends.find((b) => b.id === id);
    let fields: ReactNode;
    if (type === "ollama") {
      fields = (
        <>
          <TextInput
            label="Label"
            isLabelHidden
            value={ollamaForm.label}
            onChange={(label) => setOllamaForm({ ...ollamaForm, label })}
            placeholder="Label, e.g. Local Ollama"
          />
          <TextInput
            label="Host"
            isLabelHidden
            value={ollamaForm.host}
            onChange={(host) => setOllamaForm({ ...ollamaForm, host })}
            placeholder="localhost:11434"
          />
        </>
      );
    } else if (type === "openAiCompatible") {
      fields = (
        <>
          <TextInput
            label="Label"
            isLabelHidden
            value={openAiForm.label}
            onChange={(label) => setOpenAiForm({ ...openAiForm, label })}
            placeholder="Label, e.g. OpenRouter"
          />
          <TextInput
            label="Base URL"
            isLabelHidden
            value={openAiForm.baseUrl}
            onChange={(baseUrl) => setOpenAiForm({ ...openAiForm, baseUrl })}
            placeholder="https://api.openai.com/v1"
          />
          <TextInput
            label="API key"
            isLabelHidden
            value={openAiForm.apiKey}
            onChange={(apiKey) => setOpenAiForm({ ...openAiForm, apiKey })}
            type="password"
            placeholder={
              editingOpenAi?.kind === "openAiCompatible" &&
              editingOpenAi.apiKeySaved
                ? "API key saved — leave blank to keep it"
                : "API key"
            }
          />
          {keyStorageError ? (
            <Text display="block" size="sm" xstyle={styles.warning}>
              {`Couldn't use the system keychain (${keyStorageError}), so API keys are stored unencrypted in this app's settings file.`}
            </Text>
          ) : (
            <Hint>Stored in the system keychain.</Hint>
          )}
          <TextInput
            label="Model"
            isLabelHidden
            value={openAiForm.model}
            onChange={(model) => setOpenAiForm({ ...openAiForm, model })}
            placeholder="Model id, e.g. gpt-4.1"
          />
        </>
      );
    } else {
      fields = (
        <>
          <TextInput
            label="Label"
            isLabelHidden
            value={acpForm.label}
            onChange={(label) => setAcpForm({ ...acpForm, label })}
            placeholder="Label, e.g. Claude Code"
          />
          <TextInput
            label="Launch command"
            isLabelHidden
            value={acpForm.launchCommand}
            onChange={(launchCommand) =>
              setAcpForm({ ...acpForm, launchCommand })
            }
            placeholder="npx -y @agentclientprotocol/claude-agent-acp@latest"
          />
          <Hint>
            Runs as an external agent process — model/tool behavior depends on
            what it exposes. If it advertises a model list, that shows up in the
            chat bar once a conversation using it starts.
          </Hint>
        </>
      );
    }
    return (
      <SettingsSection
        title={`${id ? "Edit" : "Add"} ${TYPE_META[type].label}`}
      >
        <VStack gap={2} xstyle={styles.form}>
          {fields}
          {formButtons}
        </VStack>
      </SettingsSection>
    );
  }

  return (
    <VStack gap={3}>
      <SectionHeading>Agents</SectionHeading>
      <VStack gap={3}>
        {cards.map((c) => {
          const meta = TYPE_META[c.kind];
          const active = c.enabled && c.id === defaultBackendId;
          return (
            <ClickableCard
              key={c.id}
              label={
                !c.enabled
                  ? `${c.label} (turned off)`
                  : active
                    ? `${c.label}, default for new conversations`
                    : `Make ${c.label} the default for new conversations`
              }
              padding={0}
              // Turned-off agents can't be made the default, but their
              // controls (turn back on, edit, delete) stay live.
              onClick={
                c.enabled ? () => void setDefaultBackend(c.id) : undefined
              }
              xstyle={[
                styles.card,
                active && styles.cardDefault,
                !c.enabled && styles.cardOff,
              ]}
            >
              <Item
                align="first-line"
                startContent={
                  <Icon icon={meta.icon} size="sm" color="secondary" />
                }
                label={
                  <HStack gap={2} vAlign="center">
                    <Text weight="medium" maxLines={1}>
                      {c.label}
                    </Text>
                    {active && (
                      <Text size="sm" color="accent">
                        default
                      </Text>
                    )}
                  </HStack>
                }
                description={
                  <Text size="sm" color="secondary" maxLines={1}>
                    {subtitle(c)}
                  </Text>
                }
                endContent={
                  <HStack gap={1} vAlign="center">
                    <CheckboxInput
                      label={`Enable ${c.label}`}
                      isLabelHidden
                      size="sm"
                      value={c.enabled}
                      onChange={(enabled) =>
                        void saveBackend({ ...c, enabled })
                      }
                    />
                    <IconButton
                      variant="ghost"
                      size="sm"
                      label="Edit"
                      tooltip="Edit"
                      icon={<Pencil size={13} />}
                      onClick={() => startEdit(c)}
                    />
                    <IconButton
                      variant="danger"
                      size="sm"
                      label="Delete"
                      tooltip="Delete"
                      icon={<Trash2 size={13} />}
                      onClick={() => void deleteBackend(c.id)}
                    />
                  </HStack>
                }
              />
            </ClickableCard>
          );
        })}
        <ClickableCard
          label="Add an agent"
          padding={3}
          onClick={() => setView({ step: "pickType" })}
          xstyle={styles.addTile}
        >
          <VStack gap={1} hAlign="center">
            <Plus size={16} />
            <Text color="inherit">Add</Text>
          </VStack>
        </ClickableCard>
      </VStack>
      <Hint>
        Click a card to make it the default for new conversations. Each
        conversation remembers its own choice once you pick one from the chat
        bar. Untick a card to turn it off — it stays saved but is hidden from
        the chat bar and no longer checked in the background.
      </Hint>
    </VStack>
  );
}
