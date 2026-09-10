import { getIdentifier, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Check,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/tauriApi";
import {
  type AcpAgentConfig,
  type OpenAiCompatibleProviderConfig,
  useAppStore,
} from "../store";
import Button from "./Button";
import Logo from "./Logo";

const emptyForm = { label: "", baseUrl: "", apiKey: "", model: "" };

const GITHUB_URL = "https://github.com/patheticGeek/ai-leash";
const WEBSITE_URL = "https://patheticgeek.dev";

// One entry per settings page — the side nav is built to hold more without
// restructuring.
type SettingsSection = "providers" | "crashlog" | "about";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "providers", label: "Providers" },
  { id: "crashlog", label: "Crash log" },
  { id: "about", label: "About" },
];

export default function SettingsModal() {
  const open = useAppStore((s) => s.settingsModalOpen);
  const setOpen = useAppStore((s) => s.setSettingsModalOpen);
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("providers");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[620px] w-[840px] flex-col rounded-lg border border-[#26272c] bg-[#141518] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-base font-medium text-zinc-100">Settings</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            title="Close"
          >
            <X size={16} />
          </Button>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-48 shrink-0 space-y-0.5 p-2">
            {SECTIONS.map((section) => (
              <Button
                key={section.id}
                variant="unstyled"
                size="none"
                onClick={() => setActiveSection(section.id)}
                className={`block w-full rounded px-2 py-2 text-left text-sm ${
                  activeSection === section.id
                    ? "bg-[#26272c] text-zinc-100"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                {section.label}
              </Button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4 text-base">
            {activeSection === "providers" && <ProvidersSection />}
            {activeSection === "crashlog" && <CrashLogSection />}
            {activeSection === "about" && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

const emptyAcpForm = { label: "", launchCommand: "" };

function ProvidersSection() {
  const providerSettings = useAppStore((s) => s.providerSettings);
  const setOllamaHost = useAppStore((s) => s.setOllamaHost);
  const saveOpenAiCompatibleConfig = useAppStore(
    (s) => s.saveOpenAiCompatibleConfig,
  );
  const deleteOpenAiCompatibleConfig = useAppStore(
    (s) => s.deleteOpenAiCompatibleConfig,
  );
  const setActiveProvider = useAppStore((s) => s.setActiveProvider);
  const agentBackend = useAppStore((s) => s.agentBackend);
  const setAgentBackendKind = useAppStore((s) => s.setAgentBackendKind);
  const saveAcpAgentConfig = useAppStore((s) => s.saveAcpAgentConfig);
  const deleteAcpAgentConfig = useAppStore((s) => s.deleteAcpAgentConfig);
  const setActiveAcpAgent = useAppStore((s) => s.setActiveAcpAgent);

  const [hostInput, setHostInput] = useState(providerSettings.ollama.host);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const [editingAcpId, setEditingAcpId] = useState<string | null>(null);
  const [acpForm, setAcpForm] = useState(emptyAcpForm);
  const [showAcpForm, setShowAcpForm] = useState(false);

  function cancelAcpForm() {
    setShowAcpForm(false);
    setEditingAcpId(null);
  }

  function startAddAcp() {
    setEditingAcpId(null);
    setAcpForm(emptyAcpForm);
    setShowAcpForm(true);
  }

  function startEditAcp(config: AcpAgentConfig) {
    setEditingAcpId(config.id);
    setAcpForm({ label: config.label, launchCommand: config.launchCommand });
    setShowAcpForm(true);
  }

  function saveAcpForm() {
    if (!acpForm.label.trim() || !acpForm.launchCommand.trim()) return;
    saveAcpAgentConfig({
      id: editingAcpId ?? crypto.randomUUID(),
      label: acpForm.label.trim(),
      launchCommand: acpForm.launchCommand.trim(),
    });
    cancelAcpForm();
  }

  function renderAcpForm() {
    return (
      <div className="space-y-2 rounded border border-[#3a5f8f] bg-[#17181c] p-2.5">
        <input
          value={acpForm.label}
          onChange={(e) =>
            setAcpForm({ ...acpForm, label: e.currentTarget.value })
          }
          placeholder="Label, e.g. Claude Code"
          className="w-full rounded border border-[#26272c] bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none"
        />
        <input
          value={acpForm.launchCommand}
          onChange={(e) =>
            setAcpForm({ ...acpForm, launchCommand: e.currentTarget.value })
          }
          placeholder="npx -y @agentclientprotocol/claude-agent-acp@latest"
          className="w-full rounded border border-[#26272c] bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={cancelAcpForm}>
            <X size={14} />
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={saveAcpForm}>
            <Check size={14} />
            Save
          </Button>
        </div>
      </div>
    );
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(config: OpenAiCompatibleProviderConfig) {
    setEditingId(config.id);
    setForm({
      label: config.label,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    });
    setShowForm(true);
  }

  function saveForm() {
    if (!form.label.trim() || !form.baseUrl.trim()) return;
    saveOpenAiCompatibleConfig({
      kind: "openAiCompatible",
      id: editingId ?? crypto.randomUUID(),
      label: form.label.trim(),
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
    });
    cancelForm();
  }

  function renderProviderForm() {
    return (
      <div className="space-y-2 rounded border border-[#3a5f8f] bg-[#17181c] p-2.5">
        <input
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.currentTarget.value })}
          placeholder="Label, e.g. OpenRouter"
          className="w-full rounded border border-[#26272c] bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none"
        />
        <input
          value={form.baseUrl}
          onChange={(e) => setForm({ ...form, baseUrl: e.currentTarget.value })}
          placeholder="https://api.openai.com/v1"
          className="w-full rounded border border-[#26272c] bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none"
        />
        <input
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.currentTarget.value })}
          type="password"
          placeholder="API key"
          className="w-full rounded border border-[#26272c] bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none"
        />
        <div className="text-xs text-zinc-600">
          Stored locally in this app's settings, unencrypted.
        </div>
        <input
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.currentTarget.value })}
          placeholder="Model id, e.g. gpt-4.1"
          className="w-full rounded border border-[#26272c] bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={cancelForm}>
            <X size={14} />
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={saveForm}>
            <Check size={14} />
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Agent backend (default for new conversations)
        </div>
        <select
          value={agentBackend.kind}
          onChange={(e) =>
            setAgentBackendKind(e.currentTarget.value as "builtin" | "acp")
          }
          className="w-full rounded border border-[#26272c] bg-[#17181c] px-2 py-1.5 text-sm text-zinc-300 outline-none"
        >
          <option value="builtin">Built-in (this app's own tool loop)</option>
          <option value="acp">External ACP agent</option>
        </select>
        {agentBackend.kind === "acp" && (
          <div className="mt-2">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-zinc-600">
                Saved ACP agents
              </div>
              <Button variant="secondary" size="sm" onClick={startAddAcp}>
                <Plus size={13} />
                Add agent
              </Button>
            </div>

            {agentBackend.acpAgents.length === 0 && !showAcpForm && (
              <div className="text-sm text-zinc-600">
                No ACP agents saved yet — add one.
              </div>
            )}

            <div className="space-y-1.5">
              {agentBackend.acpAgents.map((c) =>
                showAcpForm && editingAcpId === c.id ? (
                  <div key={c.id}>{renderAcpForm()}</div>
                ) : (
                  <div
                    key={c.id}
                    className={`flex items-center gap-2 rounded border px-2 py-2 text-sm ${
                      agentBackend.activeAcpId === c.id
                        ? "border-[#3a5f8f] bg-[#3a5f8f]/10"
                        : "border-[#26272c] bg-[#17181c]"
                    }`}
                  >
                    <Button
                      variant="unstyled"
                      size="none"
                      onClick={() => setActiveAcpAgent(c.id)}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0 cursor-pointer text-left"
                    >
                      <div className="text-zinc-200">
                        {c.label}
                        {agentBackend.activeAcpId === c.id && (
                          <span className="ml-1.5 text-xs text-[#6a9fd8]">
                            active
                          </span>
                        )}
                      </div>
                      <div className="truncate text-zinc-600">
                        {c.launchCommand}
                      </div>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Edit"
                      onClick={() => startEditAcp(c)}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      variant="danger"
                      size="icon-sm"
                      title="Delete"
                      onClick={() => deleteAcpAgentConfig(c.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ),
              )}
              {showAcpForm && editingAcpId === null && renderAcpForm()}
            </div>

            <div className="mt-1 text-xs text-zinc-600">
              The active agent replaces the built-in tool loop entirely for this
              app's sessions — no built-in tools or retry apply. If it exposes a
              model to pick from, that shows up in the chat bar once a session
              with it starts, not here.
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Active provider (default for new conversations)
        </div>
        <select
          value={providerSettings.activeId}
          onChange={(e) => setActiveProvider(e.currentTarget.value)}
          className="w-full rounded border border-[#26272c] bg-[#17181c] px-2 py-1.5 text-sm text-zinc-300 outline-none"
        >
          <option value="ollama">Ollama</option>
          {providerSettings.openAiCompatible.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="mt-1 text-xs text-zinc-600">
          Each conversation remembers its own provider/agent and model once you
          pick one from the chat bar — this is only what a brand-new
          conversation starts from.
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Ollama
        </div>
        <div className="flex gap-2">
          <input
            value={hostInput}
            onChange={(e) => setHostInput(e.currentTarget.value)}
            placeholder="localhost:11434"
            className="flex-1 rounded border border-[#26272c] bg-[#17181c] px-2 py-1.5 text-sm text-zinc-300 outline-none"
          />
          <Button
            variant="primary"
            size="md"
            onClick={() => setOllamaHost(hostInput)}
          >
            <Check size={14} />
            Save
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            OpenAI-compatible
          </div>
          <Button variant="secondary" size="sm" onClick={startAdd}>
            <Plus size={13} />
            Add provider
          </Button>
        </div>

        {providerSettings.openAiCompatible.length === 0 && !showForm && (
          <div className="text-sm text-zinc-600">
            No providers configured yet.
          </div>
        )}

        <div className="space-y-1.5">
          {providerSettings.openAiCompatible.map((c) =>
            showForm && editingId === c.id ? (
              <div key={c.id}>{renderProviderForm()}</div>
            ) : (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded border border-[#26272c] bg-[#17181c] px-2 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-zinc-200">{c.label}</div>
                  <div className="truncate text-zinc-600">{c.baseUrl}</div>
                </div>
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
                  onClick={() => deleteOpenAiCompatibleConfig(c.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ),
          )}
          {showForm && editingId === null && renderProviderForm()}
        </div>
      </div>
    </div>
  );
}

function CrashLogSection() {
  const [log, setLog] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getCrashLog().then(setLog);
  }, []);

  async function refresh() {
    setLog(await api.getCrashLog());
  }

  async function clear() {
    await api.clearCrashLog();
    setLog("");
  }

  async function copy() {
    if (!log) return;
    await navigator.clipboard.writeText(log);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Crash log
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={refresh}>
            <RefreshCw size={13} />
            Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={copy} disabled={!log}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="danger" size="sm" onClick={clear} disabled={!log}>
            <Trash2 size={13} />
            Clear
          </Button>
        </div>
      </div>
      <div className="text-xs text-zinc-600">
        Backend panics and frontend errors (uncaught exceptions, unhandled
        promise rejections, React crashes) are appended here as they happen —
        including ones from a previous run, so you can find out what happened
        after restarting the app.
      </div>
      <pre className="flex-1 select-text overflow-auto whitespace-pre-wrap rounded border border-[#26272c] bg-[#0e0f12] p-2.5 text-xs text-zinc-400">
        {log === null ? "Loading…" : log === "" ? "No crashes logged." : log}
      </pre>
    </div>
  );
}

function AboutSection() {
  const [info, setInfo] = useState<{
    version: string;
    identifier: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([getVersion(), getIdentifier()]).then(([version, identifier]) =>
      setInfo({ version, identifier }),
    );
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Logo className="h-14 w-auto" />
      <div className="text-xs text-zinc-600">
        v{info?.version ?? "…"} ({__COMMIT_HASH__}
        {import.meta.env.DEV ? " dev" : ""}) · {info?.identifier ?? "…"}
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openUrl(GITHUB_URL)}
        >
          <ExternalLink size={13} />
          source code
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openUrl(WEBSITE_URL)}
        >
          <ExternalLink size={13} />
          my website
        </Button>
      </div>
    </div>
  );
}
