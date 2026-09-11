import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  type OpenAiCompatibleProviderConfig,
  useAppStore,
} from "../../../store";
import Button from "../../../ui/Button";

const emptyForm = { label: "", baseUrl: "", apiKey: "", model: "" };

export default function ProviderSettingsTab() {
  const providerSettings = useAppStore((s) => s.providerSettings);
  const setOllamaHost = useAppStore((s) => s.setOllamaHost);
  const saveOpenAiCompatibleConfig = useAppStore(
    (s) => s.saveOpenAiCompatibleConfig,
  );
  const deleteOpenAiCompatibleConfig = useAppStore(
    (s) => s.deleteOpenAiCompatibleConfig,
  );
  const setActiveProvider = useAppStore((s) => s.setActiveProvider);

  const [hostInput, setHostInput] = useState(providerSettings.ollama.host);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

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
      <div className="space-y-2 rounded-md bg-[#17181c] p-2.5 shadow-[0_0_0_1px_#3a5f8f]">
        <input
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.currentTarget.value })}
          placeholder="Label, e.g. OpenRouter"
          className="w-full rounded-md bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none shadow-[var(--al-shadow)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_#3a5f8f]"
        />
        <input
          value={form.baseUrl}
          onChange={(e) => setForm({ ...form, baseUrl: e.currentTarget.value })}
          placeholder="https://api.openai.com/v1"
          className="w-full rounded-md bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none shadow-[var(--al-shadow)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_#3a5f8f]"
        />
        <input
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.currentTarget.value })}
          type="password"
          placeholder="API key"
          className="w-full rounded-md bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none shadow-[var(--al-shadow)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_#3a5f8f]"
        />
        <div className="text-xs text-zinc-600">
          Stored locally in this app's settings, unencrypted.
        </div>
        <input
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.currentTarget.value })}
          placeholder="Model id, e.g. gpt-4.1"
          className="w-full rounded-md bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none shadow-[var(--al-shadow)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_#3a5f8f]"
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
          Active provider (default for new conversations)
        </div>
        <select
          value={providerSettings.activeId}
          onChange={(e) => setActiveProvider(e.currentTarget.value)}
          className="w-full rounded-md bg-[#17181c] px-2 py-1.5 text-sm text-zinc-300 outline-none shadow-[var(--al-shadow)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_#3a5f8f]"
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
            className="flex-1 rounded-md bg-[#17181c] px-2 py-1.5 text-sm text-zinc-300 outline-none shadow-[var(--al-shadow)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_#3a5f8f]"
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
                className="flex items-center gap-2 rounded-md bg-[#17181c] px-2 py-2 text-sm shadow-[var(--al-shadow)]"
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
