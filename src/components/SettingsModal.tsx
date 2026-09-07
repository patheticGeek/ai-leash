import { useState } from "react";
import { useAppStore, type AgentBackend, type OpenAiCompatibleProviderConfig } from "../store";

const emptyForm = { label: "", baseUrl: "", apiKey: "", model: "" };

// Known-good launch commands for ACP agents the user already has installed
// and authenticated via their own CLI login — see plan.md's research notes.
// Claude: `claude-agent-acp` wraps the official Claude Agent SDK over ACP,
// reusing an existing `claude` CLI login. Copilot: the `copilot` CLI ships
// native ACP support (`copilot --acp`, stdio by default), reusing existing
// GitHub auth. Both are just launch-command strings for the generic ACP
// backend already built — no other code needed for either.
const ACP_PRESETS = [
  { label: "Claude Code", command: "npx -y @agentclientprotocol/claude-agent-acp@latest" },
  { label: "GitHub Copilot", command: "copilot --acp" },
];

// One entry per settings page — only "Providers" exists today, but the side
// nav is built to hold more (e.g. general/appearance) without restructuring.
type SettingsSection = "providers";

const SECTIONS: { id: SettingsSection; label: string }[] = [{ id: "providers", label: "Providers" }];

export default function SettingsModal() {
  const open = useAppStore((s) => s.settingsModalOpen);
  const setOpen = useAppStore((s) => s.setSettingsModalOpen);
  const [activeSection, setActiveSection] = useState<SettingsSection>("providers");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[560px] w-[760px] flex-col rounded-lg border border-[#26272c] bg-[#141518] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#26272c] px-4 py-3">
          <div className="text-sm font-medium text-zinc-100">Settings</div>
          <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-200">
            ×
          </button>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-40 shrink-0 space-y-0.5 border-r border-[#26272c] p-2">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`block w-full rounded px-2 py-1.5 text-left text-xs ${
                  activeSection === section.id
                    ? "bg-[#26272c] text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4 text-sm">
            {activeSection === "providers" && <ProvidersSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProvidersSection() {
  const providerSettings = useAppStore((s) => s.providerSettings);
  const setOllamaHost = useAppStore((s) => s.setOllamaHost);
  const saveOpenAiCompatibleConfig = useAppStore((s) => s.saveOpenAiCompatibleConfig);
  const deleteOpenAiCompatibleConfig = useAppStore((s) => s.deleteOpenAiCompatibleConfig);
  const setActiveProvider = useAppStore((s) => s.setActiveProvider);
  const agentBackend = useAppStore((s) => s.agentBackend);
  const setAgentBackend = useAppStore((s) => s.setAgentBackend);

  const [hostInput, setHostInput] = useState(providerSettings.ollama.host);
  const [acpCommandInput, setAcpCommandInput] = useState(
    agentBackend.kind === "acp" ? agentBackend.launchCommand : "",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  function selectAcpPreset(command: string) {
    setAcpCommandInput(command);
    setAgentBackend({ kind: "acp", launchCommand: command });
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
    setShowForm(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Agent backend
        </div>
        <select
          value={agentBackend.kind}
          onChange={(e) => {
            const backend: AgentBackend =
              e.currentTarget.value === "acp"
                ? { kind: "acp", launchCommand: acpCommandInput }
                : { kind: "builtin" };
            setAgentBackend(backend);
          }}
          className="w-full rounded border border-[#26272c] bg-[#17181c] px-2 py-1 text-xs text-zinc-300 outline-none"
        >
          <option value="builtin">Built-in (this app's own tool loop)</option>
          <option value="acp">External ACP agent</option>
        </select>
        <div className="mt-2 flex gap-2">
          {ACP_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => selectAcpPreset(preset.command)}
              className={`rounded border px-2 py-1 text-xs ${
                agentBackend.kind === "acp" && agentBackend.launchCommand === preset.command
                  ? "border-[#3a5f8f] bg-[#3a5f8f]/20 text-zinc-100"
                  : "border-[#26272c] text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-zinc-600">
          Quick-select shells out to the CLI you already have installed and
          logged in ({ACP_PRESETS.map((p) => p.label).join(" / ")}) — no API
          key needed here.
        </div>
        {agentBackend.kind === "acp" && (
          <div className="mt-2">
            <div className="flex gap-2">
              <input
                value={acpCommandInput}
                onChange={(e) => setAcpCommandInput(e.currentTarget.value)}
                placeholder="npx -y @agentclientprotocol/claude-agent-acp@latest"
                className="flex-1 rounded border border-[#26272c] bg-[#17181c] px-2 py-1 text-xs text-zinc-300 outline-none"
              />
              <button
                onClick={() => setAgentBackend({ kind: "acp", launchCommand: acpCommandInput })}
                className="rounded bg-[#3a5f8f] px-3 py-1 text-xs text-white hover:bg-[#4a6f9f]"
              >
                Save
              </button>
            </div>
            <div className="mt-1 text-[10px] text-zinc-600">
              Shell command used to launch the ACP agent subprocess. Replaces the
              built-in tool loop entirely for this app's sessions while active — no
              model selection, retry, or built-in tools apply.
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Active provider
        </div>
        <select
          value={providerSettings.activeId}
          onChange={(e) => setActiveProvider(e.currentTarget.value)}
          className="w-full rounded border border-[#26272c] bg-[#17181c] px-2 py-1 text-xs text-zinc-300 outline-none"
        >
          <option value="ollama">Ollama</option>
          {providerSettings.openAiCompatible.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Ollama
        </div>
        <div className="flex gap-2">
          <input
            value={hostInput}
            onChange={(e) => setHostInput(e.currentTarget.value)}
            placeholder="localhost:11434"
            className="flex-1 rounded border border-[#26272c] bg-[#17181c] px-2 py-1 text-xs text-zinc-300 outline-none"
          />
          <button
            onClick={() => setOllamaHost(hostInput)}
            className="rounded bg-[#3a5f8f] px-3 py-1 text-xs text-white hover:bg-[#4a6f9f]"
          >
            Save
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            OpenAI-compatible
          </div>
          <button
            onClick={startAdd}
            className="rounded border border-[#26272c] px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            + Add provider
          </button>
        </div>

        {providerSettings.openAiCompatible.length === 0 && !showForm && (
          <div className="text-xs text-zinc-600">No providers configured yet.</div>
        )}

        <div className="space-y-1.5">
          {providerSettings.openAiCompatible.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded border border-[#26272c] bg-[#17181c] px-2 py-1.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="text-zinc-200">{c.label}</div>
                <div className="truncate text-zinc-600">{c.baseUrl}</div>
              </div>
              <button onClick={() => startEdit(c)} className="text-zinc-500 hover:text-zinc-200">
                Edit
              </button>
              <button
                onClick={() => deleteOpenAiCompatibleConfig(c.id)}
                className="text-zinc-500 hover:text-red-400"
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        {showForm && (
          <div className="mt-2 space-y-2 rounded border border-[#26272c] bg-[#17181c] p-2.5">
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.currentTarget.value })}
              placeholder="Label, e.g. OpenRouter"
              className="w-full rounded border border-[#26272c] bg-[#141518] px-2 py-1 text-xs text-zinc-300 outline-none"
            />
            <input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.currentTarget.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded border border-[#26272c] bg-[#141518] px-2 py-1 text-xs text-zinc-300 outline-none"
            />
            <input
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.currentTarget.value })}
              type="password"
              placeholder="API key"
              className="w-full rounded border border-[#26272c] bg-[#141518] px-2 py-1 text-xs text-zinc-300 outline-none"
            />
            <div className="text-[10px] text-zinc-600">
              Stored locally in this app's settings, unencrypted.
            </div>
            <input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.currentTarget.value })}
              placeholder="Model id, e.g. gpt-4.1"
              className="w-full rounded border border-[#26272c] bg-[#141518] px-2 py-1 text-xs text-zinc-300 outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={saveForm}
                className="rounded bg-[#3a5f8f] px-3 py-1 text-xs text-white hover:bg-[#4a6f9f]"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
