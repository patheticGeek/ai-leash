import { Check, Pencil, Play, Plus, Square, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/ui/badge";
import { Button, revealOnGroupHover } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { type ActionSummary, api } from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";
import { useActions } from "../../actions/useActions";

const emptyForm = { name: "", command: "" };

export default function ActionsTab() {
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const { actions, refresh, checkoutPath } = useActions();
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
    if (!name || !command || !checkoutPath) return;
    if (editingId) {
      await api.updateAction(checkoutPath, editingId, name, command);
    } else {
      await api.createAction(checkoutPath, name, command);
    }
    cancelForm();
    refresh();
  }

  async function remove(id: string) {
    if (!checkoutPath) return;
    await api.deleteAction(checkoutPath, id);
    refresh();
  }

  async function toggle(action: ActionSummary) {
    if (!checkoutPath) return;
    if (action.running) {
      await api.stopAction(checkoutPath, action.id);
    } else {
      await api.runAction(checkoutPath, action.id);
      openTerminal(action);
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
          interactive
          className="group flex-row items-stretch gap-0 rounded-md py-0 text-xs"
        >
          <Button
            variant="unstyled"
            size="none"
            onClick={() => openTerminal(action)}
            className="min-w-0 flex-1 flex-col items-start px-2.5 py-2 text-left"
          >
            <div className="flex w-full items-center gap-2">
              <Badge
                size="sm"
                variant={action.running ? "warning" : "muted"}
                outline
                className="shrink-0"
              >
                {action.running ? "running…" : "stopped"}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-zinc-300">
                {action.name}
              </span>
            </div>
            <div className="mt-1 w-full truncate text-xs text-zinc-600">
              {action.command}
            </div>
          </Button>
          <div className="flex shrink-0 items-center gap-1 pr-2">
            <Button
              variant="danger"
              size="icon-sm"
              title="Delete"
              onClick={() => remove(action.id)}
              className={revealOnGroupHover}
            >
              <Trash2 size={12} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit"
              onClick={() => startEdit(action)}
              className={revealOnGroupHover}
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
        <div className="space-y-2 rounded-md bg-raised p-2.5 shadow-[0_0_0_1px_var(--primary)]">
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
        <Button variant="ghost" size="md" onClick={startAdd}>
          <Plus size={14} />
          Add action
        </Button>
      )}
    </div>
  );
}
