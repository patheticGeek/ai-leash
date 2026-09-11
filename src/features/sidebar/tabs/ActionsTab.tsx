import { Check, Pencil, Play, Plus, Square, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { type ActionSummary, api } from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";
import { useActions } from "../../actions/useActions";

const emptyForm = { name: "", command: "" };

export default function ActionsTab() {
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const { actions, refresh } = useActions();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(action: ActionSummary) {
    setEditingId(action.id);
    setForm({ name: action.name, command: action.command });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function saveForm() {
    const name = form.name.trim();
    const command = form.command.trim();
    if (!name || !command) return;
    if (editingId) {
      await api.updateAction(editingId, name, command);
    } else {
      await api.createAction(name, command);
    }
    cancelForm();
    refresh();
  }

  async function remove(id: string) {
    await api.deleteAction(id);
    refresh();
  }

  async function toggle(action: ActionSummary) {
    if (action.running) {
      await api.stopAction(action.id);
    } else {
      await api.runAction(action.id);
    }
    refresh();
  }

  function openTerminal(action: ActionSummary) {
    openPanelTab("action", { path: action.id, label: action.name });
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-2 gap-2">
      {actions.length === 0 && !showForm && (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="text-center text-sm text-zinc-600">
            No actions defined yet. Actions are named background commands (e.g.
            "dev" → "npm run dev") that you and the agent can start and stop.
          </div>
        </div>
      )}
      {actions.map((action) => (
        <Card
          key={action.id}
          className="group cursor-default gap-0 rounded-md px-2.5 py-1.5 text-xs shadow-[var(--al-shadow)] transition-shadow duration-150 hover:shadow-[0_0_0_1px_#3a5f8f]"
        >
          <div className="flex items-center gap-2">
            <Button
              variant="unstyled"
              size="none"
              onClick={() => openTerminal(action)}
              className="min-w-0 flex-1 text-left flex-col items-start"
            >
              <div className="flex items-center gap-2">
                <Badge
                  className={`h-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                    action.running
                      ? "shadow-[0_0_0_1px_rgba(120,53,15,0.5)] bg-amber-950/20 text-amber-400"
                      : "shadow-[0_0_0_1px_#27272a] bg-zinc-900/40 text-zinc-500"
                  }`}
                >
                  {action.running ? "running…" : "stopped"}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-zinc-300">
                  {action.name}
                </span>
              </div>

              <div className="mt-1 truncate text-xs text-zinc-600">
                {action.command}
              </div>
            </Button>
            <Button
              variant="danger"
              size="icon-sm"
              title="Delete"
              onClick={() => remove(action.id)}
              className="shrink-0 opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={12} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit"
              onClick={() => startEdit(action)}
              className="shrink-0 opacity-0 group-hover:opacity-100"
            >
              <Pencil size={12} />
            </Button>
            <Button
              variant={action.running ? "danger" : "secondary"}
              size="icon-sm"
              title={action.running ? "Stop action" : "Run action"}
              onClick={() => toggle(action)}
              className="shrink-0"
            >
              {action.running ? <Square size={12} /> : <Play size={12} />}
            </Button>
          </div>
        </Card>
      ))}
      {showForm ? (
        <div className="space-y-2 rounded-md bg-[#17181c] p-2.5 shadow-[0_0_0_1px_#3a5f8f]">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
            placeholder="Name, e.g. dev"
          />
          <Input
            value={form.command}
            onChange={(e) =>
              setForm({ ...form, command: e.currentTarget.value })
            }
            placeholder="Command, e.g. npm run dev"
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
      ) : (
        <Button
          variant="secondary"
          size="md"
          onClick={startAdd}
          className="justify-center"
        >
          <Plus size={14} />
          Add action
        </Button>
      )}
    </div>
  );
}
