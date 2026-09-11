import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { type AcpAgentConfig, useAppStore } from "../../../store";
import Button from "../../../ui/Button";

const emptyAcpForm = { label: "", launchCommand: "" };

export default function AcpSettingsTab() {
  const agentBackend = useAppStore((s) => s.agentBackend);
  const setAgentBackendKind = useAppStore((s) => s.setAgentBackendKind);
  const saveAcpAgentConfig = useAppStore((s) => s.saveAcpAgentConfig);
  const deleteAcpAgentConfig = useAppStore((s) => s.deleteAcpAgentConfig);
  const setActiveAcpAgent = useAppStore((s) => s.setActiveAcpAgent);

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
      <div className="space-y-2 rounded-md bg-[#17181c] p-2.5 shadow-[0_0_0_1px_#3a5f8f]">
        <input
          value={acpForm.label}
          onChange={(e) =>
            setAcpForm({ ...acpForm, label: e.currentTarget.value })
          }
          placeholder="Label, e.g. Claude Code"
          className="w-full rounded-md bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none shadow-[var(--al-shadow)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_#3a5f8f]"
        />
        <input
          value={acpForm.launchCommand}
          onChange={(e) =>
            setAcpForm({ ...acpForm, launchCommand: e.currentTarget.value })
          }
          placeholder="npx -y @agentclientprotocol/claude-agent-acp@latest"
          className="w-full rounded-md bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 outline-none shadow-[var(--al-shadow)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_#3a5f8f]"
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
          className="w-full rounded-md bg-[#17181c] px-2 py-1.5 text-sm text-zinc-300 outline-none shadow-[var(--al-shadow)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_#3a5f8f]"
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
                    className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
                      agentBackend.activeAcpId === c.id
                        ? "shadow-[0_0_0_1px_#3a5f8f] bg-[#3a5f8f]/10"
                        : "shadow-[var(--al-shadow)] bg-[#17181c]"
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
    </div>
  );
}
