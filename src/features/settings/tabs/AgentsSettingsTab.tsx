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
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Checkbox } from "@/ui/checkbox";
import { Input } from "@/ui/input";
import {
  deleteBackend,
  saveBackend,
  setDefaultBackend,
  useBackends,
  useDefaultBackendId,
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
        apiKey: config.apiKey,
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
            onClick={() => setView({ step: "grid" })}
          >
            <X size={14} />
            Cancel
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {(Object.keys(TYPE_META) as CardType[]).map((type) => {
            const meta = TYPE_META[type];
            return (
              <Button
                key={type}
                variant="card"
                size="none"
                onClick={() => startAdd(type)}
                className="w-full"
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
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  if (view.step === "form") {
    const { type, id } = view;
    return (
      <div className="space-y-3">
        <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          {id ? "Edit" : "Add"} {TYPE_META[type].label}
        </div>
        {type === "ollama" && (
          <div className="space-y-2 rounded-md bg-raised p-2.5 shadow-[0_0_0_1px_var(--primary)]">
            <Input
              value={ollamaForm.label}
              onChange={(e) =>
                setOllamaForm({ ...ollamaForm, label: e.currentTarget.value })
              }
              placeholder="Label, e.g. Local Ollama"
            />
            <Input
              value={ollamaForm.host}
              onChange={(e) =>
                setOllamaForm({ ...ollamaForm, host: e.currentTarget.value })
              }
              placeholder="localhost:11434"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => setView({ step: "grid" })}
              >
                <X size={14} />
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={saveForm}>
                <Check size={14} />
                Save
              </Button>
            </div>
          </div>
        )}
        {type === "openAiCompatible" && (
          <div className="space-y-2 rounded-md bg-raised p-2.5 shadow-[0_0_0_1px_var(--primary)]">
            <Input
              value={openAiForm.label}
              onChange={(e) =>
                setOpenAiForm({ ...openAiForm, label: e.currentTarget.value })
              }
              placeholder="Label, e.g. OpenRouter"
            />
            <Input
              value={openAiForm.baseUrl}
              onChange={(e) =>
                setOpenAiForm({ ...openAiForm, baseUrl: e.currentTarget.value })
              }
              placeholder="https://api.openai.com/v1"
            />
            <Input
              value={openAiForm.apiKey}
              onChange={(e) =>
                setOpenAiForm({ ...openAiForm, apiKey: e.currentTarget.value })
              }
              type="password"
              placeholder="API key"
            />
            <div className="text-xs text-zinc-600">
              Stored in this app's settings file, unencrypted.
            </div>
            <Input
              value={openAiForm.model}
              onChange={(e) =>
                setOpenAiForm({ ...openAiForm, model: e.currentTarget.value })
              }
              placeholder="Model id, e.g. gpt-4.1"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => setView({ step: "grid" })}
              >
                <X size={14} />
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={saveForm}>
                <Check size={14} />
                Save
              </Button>
            </div>
          </div>
        )}
        {type === "acp" && (
          <div className="space-y-2 rounded-md bg-raised p-2.5 shadow-[0_0_0_1px_var(--primary)]">
            <Input
              value={acpForm.label}
              onChange={(e) =>
                setAcpForm({ ...acpForm, label: e.currentTarget.value })
              }
              placeholder="Label, e.g. Claude Code"
            />
            <Input
              value={acpForm.launchCommand}
              onChange={(e) =>
                setAcpForm({ ...acpForm, launchCommand: e.currentTarget.value })
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
                size="md"
                onClick={() => setView({ step: "grid" })}
              >
                <X size={14} />
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={saveForm}>
                <Check size={14} />
                Save
              </Button>
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
        {cards.map((c) => {
          const meta = TYPE_META[c.kind];
          const active = c.enabled && c.id === defaultBackendId;
          return (
            <Card
              key={c.id}
              interactive
              selected={active}
              className={cn(
                "flex-row items-stretch gap-0 rounded-md py-0 text-sm",
                !c.enabled && "opacity-60",
              )}
            >
              <Button
                variant="unstyled"
                size="none"
                onClick={() => void setDefaultBackend(c.id)}
                disabled={!c.enabled}
                title={
                  !c.enabled
                    ? "Turned off"
                    : active
                      ? "Default for new conversations"
                      : "Make default for new conversations"
                }
                className="min-w-0 flex-1 flex-col items-start gap-1.5 px-3 py-2.5 text-left"
              >
                <span className="flex w-full items-center gap-2">
                  <meta.icon size={15} className="shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate text-zinc-200">
                    {c.label}
                    {active && (
                      <span className="ml-1.5 text-xs text-primary-hover">
                        default
                      </span>
                    )}
                  </span>
                </span>
                <span className="w-full truncate pl-[23px] text-xs text-zinc-600">
                  {subtitle(c)}
                </span>
              </Button>
              <div className="flex shrink-0 items-center gap-1 pr-2">
                <Checkbox
                  checked={c.enabled}
                  onCheckedChange={(next) =>
                    void saveBackend({ ...c, enabled: next === true })
                  }
                  title={c.enabled ? "Turn off" : "Turn on"}
                  aria-label={`Enable ${c.label}`}
                  className="mr-1"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Edit"
                  onClick={() => startEdit(c)}
                >
                  <Pencil size={13} />
                </Button>
                <Button
                  variant="danger"
                  size="icon-sm"
                  title="Delete"
                  onClick={() => void deleteBackend(c.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </Card>
          );
        })}
        <Button
          variant="unstyled"
          size="none"
          onClick={() => setView({ step: "pickType" })}
          className="flex w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-700 px-3 py-2.5 text-zinc-500 cursor-pointer hover:border-zinc-500 hover:text-zinc-300"
        >
          <Plus size={16} />
          <span className="text-sm">Add</span>
        </Button>
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
