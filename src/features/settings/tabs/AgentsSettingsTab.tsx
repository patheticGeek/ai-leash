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
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { useAppStore } from "../../../store";

// One flat grid of every configured backend — Ollama connections, ACP
// agents, then OpenAI-compatible APIs — matching what the user asked for
// ("claude, copilot, ollama" as one set of default cards, not three
// separate sections). Which underlying loop a card runs on (this app's own
// tool loop vs. an external ACP subprocess) is never shown here — a card is
// just "an agent", same framing `useChatSession.ts`'s chat-bar picker
// already uses.
type CardType = "ollama" | "acp" | "openAiCompatible";

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
  const providerSettings = useAppStore((s) => s.providerSettings);
  const agentBackend = useAppStore((s) => s.agentBackend);
  const defaultBackend = useAppStore((s) => s.defaultBackend);
  const setDefaultBackend = useAppStore((s) => s.setDefaultBackend);
  const saveOllamaConfig = useAppStore((s) => s.saveOllamaConfig);
  const deleteOllamaConfig = useAppStore((s) => s.deleteOllamaConfig);
  const saveOpenAiCompatibleConfig = useAppStore(
    (s) => s.saveOpenAiCompatibleConfig,
  );
  const deleteOpenAiCompatibleConfig = useAppStore(
    (s) => s.deleteOpenAiCompatibleConfig,
  );
  const saveAcpAgentConfig = useAppStore((s) => s.saveAcpAgentConfig);
  const deleteAcpAgentConfig = useAppStore((s) => s.deleteAcpAgentConfig);

  const [view, setView] = useState<View>({ step: "grid" });
  const [ollamaForm, setOllamaForm] = useState(emptyOllamaForm);
  const [openAiForm, setOpenAiForm] = useState(emptyOpenAiForm);
  const [acpForm, setAcpForm] = useState(emptyAcpForm);

  function isDefaultCard(type: CardType, id: string): boolean {
    return type === "acp"
      ? defaultBackend.kind === "acp" && defaultBackend.acpId === id
      : defaultBackend.kind === "builtin" && defaultBackend.providerId === id;
  }

  function makeDefault(type: CardType, id: string) {
    setDefaultBackend(
      type === "acp"
        ? { kind: "acp", acpId: id }
        : { kind: "builtin", providerId: id },
    );
  }

  function startAdd(type: CardType) {
    if (type === "ollama") setOllamaForm(emptyOllamaForm);
    if (type === "openAiCompatible") setOpenAiForm(emptyOpenAiForm);
    if (type === "acp") setAcpForm(emptyAcpForm);
    setView({ step: "form", type, id: null });
  }

  function startEdit(type: CardType, id: string) {
    if (type === "ollama") {
      const c = providerSettings.ollama.find((x) => x.id === id);
      if (!c) return;
      setOllamaForm({ label: c.label, host: c.host });
    } else if (type === "openAiCompatible") {
      const c = providerSettings.openAiCompatible.find((x) => x.id === id);
      if (!c) return;
      setOpenAiForm({
        label: c.label,
        baseUrl: c.baseUrl,
        apiKey: c.apiKey,
        model: c.model,
      });
    } else {
      const c = agentBackend.acpAgents.find((x) => x.id === id);
      if (!c) return;
      setAcpForm({ label: c.label, launchCommand: c.launchCommand });
    }
    setView({ step: "form", type, id });
  }

  function deleteCard(type: CardType, id: string) {
    if (type === "ollama") deleteOllamaConfig(id);
    else if (type === "openAiCompatible") deleteOpenAiCompatibleConfig(id);
    else deleteAcpAgentConfig(id);
  }

  function saveForm() {
    if (view.step !== "form") return;
    const { type, id } = view;
    if (type === "ollama") {
      if (!ollamaForm.label.trim() || !ollamaForm.host.trim()) return;
      saveOllamaConfig({
        kind: "ollama",
        id: id ?? crypto.randomUUID(),
        label: ollamaForm.label.trim(),
        host: ollamaForm.host.trim(),
      });
    } else if (type === "openAiCompatible") {
      if (!openAiForm.label.trim() || !openAiForm.baseUrl.trim()) return;
      saveOpenAiCompatibleConfig({
        kind: "openAiCompatible",
        id: id ?? crypto.randomUUID(),
        label: openAiForm.label.trim(),
        baseUrl: openAiForm.baseUrl.trim(),
        apiKey: openAiForm.apiKey.trim(),
        model: openAiForm.model.trim(),
      });
    } else {
      if (!acpForm.label.trim() || !acpForm.launchCommand.trim()) return;
      saveAcpAgentConfig({
        id: id ?? crypto.randomUUID(),
        label: acpForm.label.trim(),
        launchCommand: acpForm.launchCommand.trim(),
      });
    }
    setView({ step: "grid" });
  }

  const cards: {
    type: CardType;
    id: string;
    label: string;
    subtitle: string;
  }[] = [
    ...providerSettings.ollama.map((c) => ({
      type: "ollama" as const,
      id: c.id,
      label: c.label,
      subtitle: c.host || "localhost:11434",
    })),
    ...agentBackend.acpAgents.map((c) => ({
      type: "acp" as const,
      id: c.id,
      label: c.label,
      subtitle: c.launchCommand,
    })),
    ...providerSettings.openAiCompatible.map((c) => ({
      type: "openAiCompatible" as const,
      id: c.id,
      label: c.label,
      subtitle: c.baseUrl,
    })),
  ];

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
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          }}
        >
          {(Object.keys(TYPE_META) as CardType[]).map((type) => {
            const meta = TYPE_META[type];
            return (
              <Button
                key={type}
                variant="unstyled"
                size="none"
                onClick={() => startAdd(type)}
                className="flex min-w-0 flex-col items-start gap-1.5 rounded-md bg-[#141518] px-3 py-2.5 text-left shadow-[var(--al-shadow)] hover:shadow-[0_0_0_1px_#3a5f8f] hover:bg-white/5"
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
          <div className="space-y-2 rounded-md bg-[#17181c] p-2.5 shadow-[0_0_0_1px_#3a5f8f]">
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
          <div className="space-y-2 rounded-md bg-[#17181c] p-2.5 shadow-[0_0_0_1px_#3a5f8f]">
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
              Stored locally in this app's settings, unencrypted.
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
          <div className="space-y-2 rounded-md bg-[#17181c] p-2.5 shadow-[0_0_0_1px_#3a5f8f]">
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
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {cards.map((c) => {
          const meta = TYPE_META[c.type];
          const active = isDefaultCard(c.type, c.id);
          return (
            <div
              key={`${c.type}:${c.id}`}
              className={`flex min-w-0 flex-col gap-1.5 rounded-md px-3 py-2.5 text-sm ${
                active
                  ? "shadow-[0_0_0_1px_#3a5f8f] bg-[#3a5f8f]/10"
                  : "shadow-[var(--al-shadow)] bg-[#141518]"
              }`}
            >
              <div className="flex items-center gap-1">
                <Button
                  variant="unstyled"
                  size="none"
                  onClick={() => makeDefault(c.type, c.id)}
                  title={
                    active
                      ? "Default for new conversations"
                      : "Make default for new conversations"
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer text-left"
                >
                  <meta.icon size={15} className="shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate text-zinc-200">
                    {c.label}
                    {active && (
                      <span className="ml-1.5 text-xs text-[#6a9fd8]">
                        default
                      </span>
                    )}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Edit"
                  onClick={() => startEdit(c.type, c.id)}
                >
                  <Pencil size={13} />
                </Button>
                <Button
                  variant="danger"
                  size="icon-sm"
                  title="Delete"
                  onClick={() => deleteCard(c.type, c.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
              <div className="truncate pl-[23px] text-xs text-zinc-600">
                {c.subtitle}
              </div>
            </div>
          );
        })}
        <Button
          variant="unstyled"
          size="none"
          onClick={() => setView({ step: "pickType" })}
          className="flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-700 px-3 py-2.5 text-zinc-500 cursor-pointer hover:border-zinc-500 hover:text-zinc-300"
        >
          <Plus size={16} />
          <span className="text-sm">Add</span>
        </Button>
      </div>
      <div className="text-xs text-zinc-600">
        Click a card to make it the default for new conversations. Each
        conversation remembers its own choice once you pick one from the chat
        bar.
      </div>
    </div>
  );
}
