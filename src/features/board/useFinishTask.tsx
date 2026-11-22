import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  VStack,
} from "@astryxdesign/core/Layout";
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

function ChangeList({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-400">{title}</span>
      <pre className="max-h-40 overflow-auto rounded-md bg-sunken px-2 py-1.5 font-mono text-xs text-zinc-300">
        {lines.join("\n")}
      </pre>
    </div>
  );
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
    } finally {
      setWorking(false);
    }
  }

  const dialog = (
    // A destructive confirm, but not `AlertDialog`: it lists the changes
    // that would be lost, and AlertDialog's description is plain text.
    <Dialog
      isOpen={pending !== null}
      role="alertdialog"
      width={512}
      onOpenChange={(open) => {
        if (!open && !working) {
          setPending(null);
          setError(null);
        }
      }}
    >
      <Layout
        header={
          <DialogHeader
            title={`Remove #${pending?.task.number ?? ""}'s worktree?`}
            subtitle="Moving the task to Done removes its worktree. Its branch is kept."
            onOpenChange={() => {
              if (!working) {
                setPending(null);
                setError(null);
              }
            }}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              <ChangeList
                title="Uncommitted changes — lost when the worktree goes"
                lines={pending?.changes.uncommitted ?? []}
              />
              <ChangeList
                title="Commits not merged anywhere — they stay on the branch"
                lines={pending?.changes.unmergedCommits ?? []}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button
                variant="ghost"
                label="Keep it open"
                isDisabled={working}
                onClick={() => setPending(null)}
              />
              <Button
                variant="destructive"
                label={working ? "Removing…" : "Remove and mark done"}
                isDisabled={working}
                onClick={confirm}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );

  return { finish: (task, beforeId) => run(task, beforeId, false), dialog };
}
