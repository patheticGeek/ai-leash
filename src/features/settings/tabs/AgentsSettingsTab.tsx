import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
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
import type { ComponentType } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  deleteBackend,
  saveBackend,
  setDefaultBackend,
  useBackends,
  useDefaultBackendId,
  useKeyStorageError,
} from "../../../data/backends";
import type { BackendConfig } from "../../../lib/tauriApi";

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
    icon: ComponentType<{ size?: number; className?: string }>;
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

  if (view.step === "pickType") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Add a backend
          </div>
          <Button
            variant="ghost"
            size="sm"
            label="Cancel"
            icon={<X size={14} />}
            onClick={() => setView({ step: "grid" })}
          />
        </div>
        <div className="flex flex-col gap-2">
          {(Object.keys(TYPE_META) as CardType[]).map((type) => {
            const meta = TYPE_META[type];
            return (
              <ClickableCard
                key={type}
                label={meta.label}
                padding={3}
                onClick={() => startAdd(type)}
                className="flex w-full min-w-0 flex-col items-start gap-1.5 text-left"
              >
                <div className="flex w-full items-center gap-2">
                  <meta.icon size={16} className="text-zinc-500" />
                  <span className="w-full text-sm text-zinc-200">
                    {meta.label}
                  </span>
                </div>
                <span className="whitespace-normal w-full text-[11px] text-zinc-600">
                  {meta.hint}
                </span>
              </ClickableCard>
            );
          })}
        </div>
      </div>
    );
  }

  if (view.step === "form") {
    const { type, id } = view;
    const editingOpenAi = backends.find((b) => b.id === id);
    return (
      <div className="space-y-3">
        <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          {id ? "Edit" : "Add"} {TYPE_META[type].label}
        </div>
        {type === "ollama" && (
          <div className="space-y-2 rounded-md bg-raised p-2.5 shadow-[0_0_0_1px_var(--primary)]">
            <TextInput
              label="Label"
              size="sm"
              value={ollamaForm.label}
              onChange={(label) => setOllamaForm({ ...ollamaForm, label })}
              placeholder="e.g. Local Ollama"
            />
            <TextInput
              label="Host"
              size="sm"
              value={ollamaForm.host}
              onChange={(host) => setOllamaForm({ ...ollamaForm, host })}
              placeholder="localhost:11434"
            />
            <div className="flex justify-end gap-2">
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
            </div>
          </div>
        )}
        {type === "openAiCompatible" && (
          <div className="space-y-2 rounded-md bg-raised p-2.5 shadow-[0_0_0_1px_var(--primary)]">
            <TextInput
              label="Label"
              size="sm"
              value={openAiForm.label}
              onChange={(label) => setOpenAiForm({ ...openAiForm, label })}
              placeholder="e.g. OpenRouter"
            />
            <TextInput
              label="Base URL"
              size="sm"
              value={openAiForm.baseUrl}
              onChange={(baseUrl) => setOpenAiForm({ ...openAiForm, baseUrl })}
              placeholder="https://api.openai.com/v1"
            />
            <TextInput
              label="API key"
              size="sm"
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
            <div
              className={cn(
                "text-xs",
                keyStorageError ? "text-amber-400" : "text-zinc-600",
              )}
            >
              {keyStorageError
                ? `Couldn't use the system keychain (${keyStorageError}), so API keys are stored unencrypted in this app's settings file.`
                : "Stored in the system keychain."}
            </div>
            <TextInput
              label="Model"
              size="sm"
              value={openAiForm.model}
              onChange={(model) => setOpenAiForm({ ...openAiForm, model })}
              placeholder="e.g. gpt-4.1"
            />
            <div className="flex justify-end gap-2">
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
            </div>
          </div>
        )}
        {type === "acp" && (
          <div className="space-y-2 rounded-md bg-raised p-2.5 shadow-[0_0_0_1px_var(--primary)]">
            <TextInput
              label="Label"
              size="sm"
              value={acpForm.label}
              onChange={(label) => setAcpForm({ ...acpForm, label })}
              placeholder="e.g. Claude Code"
            />
            <TextInput
              label="Launch command"
              size="sm"
              value={acpForm.launchCommand}
              onChange={(launchCommand) =>
                setAcpForm({ ...acpForm, launchCommand })
              }
              placeholder="npx -y @agentclientprotocol/claude-agent-acp@latest"
            />
            <div className="text-xs text-zinc-600">
              Runs as an external agent process — model/tool behavior depends on
              what it exposes. If it advertises a model list, that shows up in
              the chat bar once a conversation using it starts.
            </div>
            <div className="flex justify-end gap-2">
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
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="mb-1.5 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Agents
      </div>
      <div className="flex flex-col gap-2">
        <List hasDividers>
          {cards.map((c) => {
            const meta = TYPE_META[c.kind];
            const active = c.enabled && c.id === defaultBackendId;
            return (
              <ListItem
                key={c.id}
                isSelected={active}
                // Turned-off agents can't be made the default, but their
                // controls (turn back on, edit, delete) stay live.
                onClick={
                  c.enabled ? () => void setDefaultBackend(c.id) : undefined
                }
                className={cn(!c.enabled && "opacity-60")}
                startContent={<meta.icon size={15} />}
                label={c.label}
                description={subtitle(c)}
                endContent={
                  <HStack gap={1} align="center">
                    {active && (
                      <Token size="sm" color="purple" label="default" />
                    )}
                    <CheckboxInput
                      label={`Enable ${c.label}`}
                      isLabelHidden
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
            );
          })}
        </List>
        <Button
          variant="quiet"
          label="Add"
          icon={<Plus size={16} />}
          width="100%"
          onClick={() => setView({ step: "pickType" })}
          className="h-auto flex-col gap-1.5 border border-dashed border-zinc-700 py-2.5 hover:border-zinc-500"
        />
      </div>
      <div className="text-xs text-zinc-600">
        Click a card to make it the default for new conversations. Each
        conversation remembers its own choice once you pick one from the chat
        bar. Untick a card to turn it off — it stays saved but is hidden from
        the chat bar and no longer checked in the background.
      </div>
    </div>
  );
}
