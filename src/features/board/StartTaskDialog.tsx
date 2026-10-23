import { Play } from "lucide-react";
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
import { effortForSize } from "../../data/board";
import { type AgentDefaults, api, type Task } from "../../lib/tauriApi";
import { useAppStore } from "../../store";
import AgentFields, { resolveAgent } from "./AgentFields";

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <Label
      htmlFor={id}
      className="cursor-pointer gap-2 font-normal text-zinc-300"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
      />
      {label}
    </Label>
  );
}

// Picks how to start a task — which agent, model, thinking level and
// permission its chat runs with, prefilled from the task's own defaults
// over the board's — then starts it (`api.startTask`).
export default function StartTaskDialog({
  task,
  boardDefaults,
  onClose,
}: {
  task: Task | null;
  boardDefaults: AgentDefaults;
  onClose: () => void;
}) {
  const openConversation = useAppStore((s) => s.openConversation);
  const [agent, setAgent] = useState<AgentDefaults>({});
  const [openAfter, setOpenAfter] = useState(false);
  const [follow, setFollow] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh choices every time it opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open
  useEffect(() => {
    if (task) {
      setAgent(resolveAgent(task.agent, boardDefaults));
      setFollow(true);
      setError(null);
    }
  }, [task]);

  async function start() {
    if (!task || starting) return;
    setStarting(true);
    setError(null);
    try {
      const conversationId = await api.startTask(task.id, {
        backendId: agent.backendId ?? undefined,
        model: agent.model ?? undefined,
        effort: agent.thinking ?? null,
        agentMode: agent.agentMode ?? null,
        bypassPermissions: agent.permissionMode
          ? agent.permissionMode === "bypass"
          : undefined,
        engagedWithProject: follow,
      });
      onClose();
      if (openAfter) await openConversation(conversationId);
    } catch (err) {
      setError(String(err));
    } finally {
      setStarting(false);
    }
  }

  const sizeThinking = effortForSize(task?.effort ?? null);

  return (
    <Dialog open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Start #{task?.number} {task?.title}
          </DialogTitle>
          <DialogDescription>
            The task gets its own chat, which starts working on it straight
            away. In a git repository it also gets its own worktree, on a new{" "}
            <code>task/{task?.number}-…</code> branch.
          </DialogDescription>
        </DialogHeader>
        <AgentFields value={agent} onChange={setAgent} inheritLabel="Default" />
        {!agent.thinking && sizeThinking && (
          <p className="text-xs text-zinc-500">
            Our own providers think at <strong>{sizeThinking}</strong> effort
            for a task this size unless you pick otherwise.
          </p>
        )}
        <div className="flex flex-col gap-2">
          <CheckRow
            label="The project chat follows it (its updates wake the project chat)"
            checked={follow}
            onChange={setFollow}
          />
          <CheckRow
            label="Open its chat after starting"
            checked={openAfter}
            onChange={setOpenAfter}
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={starting}
            onClick={start}
          >
            <Play size={14} />
            {starting ? "Starting…" : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
