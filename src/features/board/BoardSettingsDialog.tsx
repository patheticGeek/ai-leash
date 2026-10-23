import { useEffect, useId, useState } from "react";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Label } from "@/ui/label";
import { type AgentDefaults, api, type Board } from "../../lib/tauriApi";
import AgentFields from "./AgentFields";

// Board-wide settings: the agent tasks start with when they don't pick
// their own, and — for a project that isn't a git repository, where tasks
// share its one checkout — whether several may be in progress at once.
export default function BoardSettingsDialog({
  open,
  onOpenChange,
  projectRoot,
  board,
  sharedCheckout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRoot: string;
  board: Board | undefined;
  sharedCheckout: boolean;
}) {
  const [agent, setAgent] = useState<AgentDefaults>({});
  const [parallel, setParallel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parallelId = useId();

  // Fresh from the board every time it opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open
  useEffect(() => {
    if (open) {
      setAgent(board?.agentDefaults ?? {});
      setParallel(board?.parallelMainCheckoutTasks ?? false);
      setError(null);
    }
  }, [open]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.setBoardAgentDefaults(projectRoot, agent);
      if (sharedCheckout) {
        await api.setParallelMainCheckoutTasks(projectRoot, parallel);
      }
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Board settings</DialogTitle>
          <DialogDescription>
            The agent a task's chat starts with, unless the task picks its own
            or you change it when starting it.
          </DialogDescription>
        </DialogHeader>
        <AgentFields value={agent} onChange={setAgent} inheritLabel="Default" />
        {sharedCheckout && (
          <Label
            htmlFor={parallelId}
            className="cursor-pointer items-start gap-2 font-normal text-zinc-300"
          >
            <Checkbox
              id={parallelId}
              checked={parallel}
              onCheckedChange={(v) => setParallel(v === true)}
              className="mt-0.5"
            />
            <span>
              Allow several tasks in progress at once
              <span className="block text-xs text-zinc-500">
                This project isn't a git repository, so started tasks share its
                one checkout and can change the same files.
              </span>
            </span>
          </Label>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="md" disabled={saving} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
