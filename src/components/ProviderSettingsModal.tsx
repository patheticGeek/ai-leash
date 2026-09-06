import { useState } from "react";
import { useAppStore, type OpenAiCompatibleProviderConfig } from "../store";

const emptyForm = { label: "", baseUrl: "", apiKey: "", model: "" };

export default function ProviderSettingsModal() {
  const open = useAppStore((s) => s.settingsModalOpen);
  const setOpen = useAppStore((s) => s.setSettingsModalOpen);
  const providerSettings = useAppStore((s) => s.providerSettings);
  const setOllamaHost = useAppStore((s) => s.setOllamaHost);
  const saveOpenAiCompatibleConfig = useAppStore((s) => s.saveOpenAiCompatibleConfig);
  const deleteOpenAiCompatibleConfig = useAppStore((s) => s.deleteOpenAiCompatibleConfig);
  const setActiveProvider = useAppStore((s) => s.setActiveProvider);

  const [hostInput, setHostInput] = useState(providerSettings.ollama.host);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  if (!open) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[80vh] w-[560px] flex-col rounded-lg border border-[#26272c] bg-[#141518] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#26272c] px-4 py-3">
          <div className="text-sm font-medium text-zinc-100">Provider settings</div>
          <button
            onClick={() => setOpen(false)}
            className="text-zinc-500 hover:text-zinc-200"
          >
            ×
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-auto p-4 text-sm">
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
                  <button
                    onClick={() => startEdit(c)}
                    className="text-zinc-500 hover:text-zinc-200"
                  >
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
      </div>
    </div>
  );
}
