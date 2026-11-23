import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  VStack,
} from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import * as stylex from "@stylexjs/stylex";
import { Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_EFFORTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "../../data/board";
import {
  type AgentDefaults,
  api,
  type Epic,
  type Task,
  type TaskEffort,
  type TaskPriority,
  type TaskStatus,
} from "../../lib/tauriApi";
import AgentFields from "./AgentFields";
import { EpicDot, PriorityIcon } from "./TaskMeta";

// Sentinel option value for "nothing selected" (no epic / unsized).
const NONE = "none";

const styles = stylex.create({
  // The form wraps the dialog's whole Layout so Enter / Ctrl+Enter submit
  // from any field; it has to fill the dialog like the Layout would.
  form: { flex: 1, minHeight: 0, height: "100%" },
});

interface Draft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  effort: TaskEffort | null;
  epicId: string | null;
  // Which agent its chat starts with; unset parts use the board's.
  agent: AgentDefaults;
}

function draftFor(task: Task | null, defaults: Partial<Draft>): Draft {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? defaults.status ?? "todo",
    priority: task?.priority ?? defaults.priority ?? "medium",
    effort: task ? task.effort : (defaults.effort ?? null),
    epicId: task ? task.epicId : (defaults.epicId ?? null),
    agent: task?.agent ?? defaults.agent ?? {},
  };
}

// Creates a task (`task` null, prefilled from `defaults`) or edits one.
export default function TaskDialog({
  open,
  onOpenChange,
  projectRoot,
  epics,
  task,
  defaults = {},
  onFinish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRoot: string;
  epics: Epic[];
  task: Task | null;
  defaults?: Partial<Draft>;
  // Moving an existing task to Done goes through here instead of a plain
  // status change — see `useFinishTask`.
  onFinish: (task: Task) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(task, defaults));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh fields every time it opens, not whatever was typed last time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open
  useEffect(() => {
    if (open) {
      setDraft(draftFor(task, defaults));
      setError(null);
    }
  }, [open]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (task && draft.status === "done" && task.status !== "done") {
        const { status: _, ...rest } = draft;
        const updated = await api.updateTask(task.id, rest);
        await onFinish(updated);
      } else if (task) {
        await api.updateTask(task.id, draft);
      } else {
        await api.createTask(projectRoot, draft);
      }
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!task) return;
    await api.deleteTask(task.id);
    onOpenChange(false);
  }

  const selectableEpics = epics.filter(
    (e) => !e.archived || e.id === draft.epicId,
  );

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      purpose="form"
      width={576}
    >
      <VStack
        as="form"
        xstyle={styles.form}
        onSubmit={submit}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
        }}
      >
        <Layout
          header={
            <DialogHeader
              title={task ? `#${task.number} ${task.title}` : "New task"}
              onOpenChange={onOpenChange}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={4}>
                <TextInput
                  label="Title"
                  hasAutoFocus
                  value={draft.title}
                  onChange={(title) => set("title", title)}
                  placeholder="What needs doing?"
                />
                <TextArea
                  label="Description"
                  rows={8}
                  value={draft.description}
                  onChange={(description) => set("description", description)}
                  placeholder="Context, acceptance criteria, links… (Markdown)"
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Selector
                    label="Status"
                    size="sm"
                    width="100%"
                    value={draft.status}
                    onChange={(v) => set("status", v as TaskStatus)}
                    options={TASK_STATUSES.map((s) => ({
                      value: s,
                      label: STATUS_LABELS[s],
                    }))}
                  />
                  <Selector
                    label="Priority"
                    size="sm"
                    width="100%"
                    value={draft.priority}
                    onChange={(v) => set("priority", v as TaskPriority)}
                    options={TASK_PRIORITIES.map((p) => ({
                      value: p,
                      label: PRIORITY_LABELS[p],
                      icon: <PriorityIcon priority={p} />,
                    }))}
                  />
                  <Selector
                    label="Effort"
                    size="sm"
                    width="100%"
                    value={draft.effort ?? NONE}
                    onChange={(v) =>
                      set("effort", v === NONE ? null : (v as TaskEffort))
                    }
                    options={[
                      { value: NONE, label: "Unsized" },
                      ...TASK_EFFORTS.map((size) => ({
                        value: size,
                        label: size.toUpperCase(),
                      })),
                    ]}
                  />
                  <Selector
                    label="Epic"
                    size="sm"
                    width="100%"
                    value={draft.epicId ?? NONE}
                    onChange={(v) => set("epicId", v === NONE ? null : v)}
                    options={[
                      { value: NONE, label: "No epic" },
                      ...selectableEpics.map((epic) => ({
                        value: epic.id,
                        label: epic.title,
                        icon: <EpicDot color={epic.color} />,
                      })),
                    ]}
                  />
                </div>
                <AgentFields
                  value={draft.agent}
                  onChange={(agent) => set("agent", agent)}
                  inheritLabel="Board default"
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} justify="between">
                {task ? (
                  <Button
                    variant="destructive"
                    label="Delete"
                    icon={<Trash2 size={14} />}
                    onClick={remove}
                    tooltip="Delete task"
                  />
                ) : (
                  <span />
                )}
                <HStack gap={2}>
                  <Button
                    variant="ghost"
                    label="Cancel"
                    onClick={() => onOpenChange(false)}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    label={task ? "Save" : "Create task"}
                    isDisabled={!draft.title.trim() || saving}
                  />
                </HStack>
              </HStack>
            </LayoutFooter>
          }
        />
      </VStack>
    </Dialog>
  );
}
