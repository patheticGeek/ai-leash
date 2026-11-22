import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { Check, Pencil, Play, Plus, Square, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button, revealOnGroupHover } from "@/ui/button";
import { type ActionSummary, api } from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";
import { useActions } from "../../actions/useActions";

const emptyForm = { name: "", command: "" };

// How the action's current or last run stands. A run that exited on its own
// with a non-zero code is the one worth flagging.
function RunStatusBadge({ action }: { action: ActionSummary }) {
  const failed =
    action.status === "exited" &&
    action.exitCode !== null &&
    action.exitCode !== 0;
  const label = action.running
    ? "running…"
    : action.status === "exited"
      ? failed
        ? `exited ${action.exitCode}`
        : "exited"
      : "stopped";
  const token = (
    <Token
      size="sm"
      color={action.running ? "yellow" : failed ? "red" : "gray"}
      label={label}
    />
  );
  return action.endedAt ? (
    <Tooltip
      content={`Ended ${new Date(action.endedAt * 1000).toLocaleTimeString()}`}
    >
      {token}
    </Tooltip>
  ) : (
    token
  );
}

export default function ActionsTab() {
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const { actions, checkoutPath } = useActions();
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
  }

  async function remove(id: string) {
    if (!checkoutPath) return;
    await api.deleteAction(checkoutPath, id);
  }

  async function toggle(action: ActionSummary) {
    if (!checkoutPath) return;
    if (action.running) {
      await api.stopAction(checkoutPath, action.id);
    } else {
      await api.runAction(checkoutPath, action.id);
      openTerminal(action);
    }
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
      {actions.length > 0 && (
        <List density="compact" hasDividers>
          {actions.map((action) => (
            <ListItem
              key={action.id}
              // `group` drives the hover-revealed Delete/Edit buttons.
              className="group"
              onClick={() => openTerminal(action)}
              startContent={<RunStatusBadge action={action} />}
              label={action.name}
              description={action.command}
              endContent={
                <HStack gap={1} align="center">
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
                </HStack>
              }
            />
          ))}
        </List>
      )}
      {showForm ? (
        <div className="space-y-2 rounded-md bg-raised p-2.5 shadow-[0_0_0_1px_var(--primary)]">
          <TextInput
            label="Name"
            size="sm"
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
            placeholder="e.g. dev"
          />
          <TextInput
            label="Command"
            size="sm"
            value={form.command}
            onChange={(command) => setForm({ ...form, command })}
            placeholder="e.g. npm run dev"
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
