import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { type ReactNode, useState } from "react";
import {
  getConversations,
  refreshConversations,
} from "../../data/conversations";
import { api, type Task, type WorktreeChanges } from "../../lib/tauriApi";
import { useAppStore } from "../../store";

interface Pending {
  task: Task;
  beforeId: string | null;
  changes: WorktreeChanges;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// AlertDialog's description is plain text, so the files and commits are
// summarised in it: counts, plus the first few of each.
function describe(task: Task, changes: WorktreeChanges): string {
  const sample = (lines: string[]) =>
    lines.length === 0
      ? ""
      : ` (${lines.slice(0, 3).join(", ")}${lines.length > 3 ? ", …" : ""})`;
  const parts: string[] = [];
  if (changes.uncommitted.length > 0) {
    parts.push(
      `${plural(changes.uncommitted.length, "uncommitted file", "uncommitted files")}${sample(changes.uncommitted)}`,
    );
  }
  if (changes.unmergedCommits.length > 0) {
    parts.push(
      `${plural(changes.unmergedCommits.length, "commit", "commits")} not merged anywhere${sample(changes.unmergedCommits)}`,
    );
  }
  const consequence =
    changes.uncommitted.length > 0
      ? "Removing it deletes the uncommitted changes; its branch and commits are kept."
      : "Removing it keeps its branch, so the commits stay reachable.";
  return `Task #${task.number}'s worktree has ${parts.join(" and ")}. ${consequence} Keeping it leaves the task where it is.`;
}

// Moving a task to Done goes through here: it removes the task's worktree,
// so if that would lose uncommitted changes or unmerged commits, a dialog
// lists them first and only a confirmation goes ahead. Returns `finish`
// and the dialog to render.
export function useFinishTask(): {
  finish: (task: Task, beforeId: string | null) => Promise<void>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function run(task: Task, beforeId: string | null, force: boolean) {
    const result = await api.finishTask(task.id, beforeId, force);
    if (result.outcome === "needsConfirmation") {
      setPending({ task, beforeId, changes: result.changes });
      return;
    }
    setPending(null);
    // If its chat is the one on screen, reopen it: its checkout just moved
    // from the removed worktree to the primary one.
    const { activeSessionId, openConversation } = useAppStore.getState();
    if (task.conversationId && task.conversationId === activeSessionId) {
      await refreshConversations();
      if (getConversations().some((c) => c.id === activeSessionId)) {
        await openConversation(activeSessionId);
      }
    }
  }

  async function confirm() {
    if (!pending) return;
    setWorking(true);
    setError(null);
    try {
      await run(pending.task, pending.beforeId, true);
    } catch (err) {
      setError(String(err));
    }
    setWorking(false);
  }

  const close = () => {
    if (working) return;
    setPending(null);
    setError(null);
  };

  const dialog = pending && (
    <AlertDialog
      isOpen
      onOpenChange={(open) => !open && close()}
      title={
        pending.changes.uncommitted.length > 0
          ? `Finish task #${pending.task.number} with uncommitted changes?`
          : `Finish task #${pending.task.number} with unmerged commits?`
      }
      description={
        error
          ? `${describe(pending.task, pending.changes)} Couldn't remove it: ${error}`
          : describe(pending.task, pending.changes)
      }
      cancelLabel="Keep it open"
      actionLabel="Remove worktree"
      isActionLoading={working}
      onAction={confirm}
      width={480}
    />
  );

  return { finish: (task, beforeId) => run(task, beforeId, false), dialog };
}
