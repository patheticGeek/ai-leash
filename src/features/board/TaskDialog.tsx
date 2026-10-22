import { Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Field, FieldLabel } from "@/ui/field";
import { Input } from "@/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { Textarea } from "@/ui/textarea";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_EFFORTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "../../data/board";
import {
  api,
  type Epic,
  type Task,
  type TaskEffort,
  type TaskPriority,
  type TaskStatus,
} from "../../lib/tauriApi";
import { EpicDot, PriorityIcon } from "./TaskMeta";

// Radix `Select` reserves "" for "nothing selected".
const NONE = "none";

interface Draft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  effort: TaskEffort | null;
  epicId: string | null;
}

function draftFor(task: Task | null, defaults: Partial<Draft>): Draft {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? defaults.status ?? "todo",
    priority: task?.priority ?? defaults.priority ?? "medium",
    effort: task ? task.effort : (defaults.effort ?? null),
    epicId: task ? task.epicId : (defaults.epicId ?? null),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>
              {task ? `#${task.number} ${task.title}` : "New task"}
            </DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="task-title">Title</FieldLabel>
            <Input
              id="task-title"
              autoFocus
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="What needs doing?"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="task-description">Description</FieldLabel>
            <Textarea
              id="task-description"
              rows={8}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Context, acceptance criteria, links… (Markdown)"
              className="max-h-80"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select
                value={draft.status}
                onValueChange={(v) => set("status", v as TaskStatus)}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Priority</FieldLabel>
              <Select
                value={draft.priority}
                onValueChange={(v) => set("priority", v as TaskPriority)}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      <PriorityIcon priority={p} />
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Effort</FieldLabel>
              <Select
                value={draft.effort ?? NONE}
                onValueChange={(v) =>
                  set("effort", v === NONE ? null : (v as TaskEffort))
                }
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unsized</SelectItem>
                  {TASK_EFFORTS.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Epic</FieldLabel>
              <Select
                value={draft.epicId ?? NONE}
                onValueChange={(v) => set("epicId", v === NONE ? null : v)}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No epic</SelectItem>
                  {selectableEpics.map((epic) => (
                    <SelectItem key={epic.id} value={epic.id}>
                      <EpicDot color={epic.color} />
                      {epic.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter className="sm:justify-between">
            {task ? (
              <Button
                type="button"
                variant="danger"
                size="md"
                onClick={remove}
                title="Delete task"
              >
                <Trash2 size={14} />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={!draft.title.trim() || saving}
              >
                {task ? "Save" : "Create task"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
