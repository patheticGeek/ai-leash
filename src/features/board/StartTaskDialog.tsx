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
import { Field, FieldLabel } from "@/ui/field";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import {
  useBackendModels,
  useBackends,
  useDefaultBackendId,
} from "../../data/backends";
import { effortForSize } from "../../data/board";
import { useAcpAgentCatalog } from "../../lib/acpCatalogQuery";
import { api, type Task } from "../../lib/tauriApi";
import { useAppStore } from "../../store";

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

// Radix `Select` reserves "" — this stands for "the agent's own default".
const DEFAULT = "default";
const NATIVE_EFFORTS = ["low", "medium", "high"];

// Picks how to start a task — which agent, model, effort and permission
// mode its chat runs with — then starts it (`api.startTask`).
export default function StartTaskDialog({
  task,
  onClose,
}: {
  task: Task | null;
  onClose: () => void;
}) {
  const backends = useBackends().filter((b) => b.enabled);
  const defaultBackendId = useDefaultBackendId();
  const modelsByBackend = useBackendModels();
  const catalog = useAcpAgentCatalog();
  const openConversation = useAppStore((s) => s.openConversation);
  const [backendId, setBackendId] = useState(defaultBackendId);
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState(DEFAULT);
  const [bypass, setBypass] = useState(false);
  const [openAfter, setOpenAfter] = useState(false);
  const [follow, setFollow] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backend = backends.find((b) => b.id === backendId);
  const acp =
    backend?.kind === "acp"
      ? catalog.find((c) => c.id === backendId)
      : undefined;

  // Each backend starts from its own default: the model last used on a
  // native one, the agent's own pick for ACP, and the size-based effort.
  useEffect(() => {
    if (!task) return;
    setModel(backend && backend.kind !== "acp" ? backend.model : "");
    setEffort(
      backend?.kind === "acp"
        ? DEFAULT
        : (effortForSize(task.effort) ?? DEFAULT),
    );
  }, [task, backend]);

  // Fresh choices every time it opens.
  useEffect(() => {
    if (task) {
      setBackendId(defaultBackendId);
      setBypass(false);
      setFollow(true);
      setError(null);
    }
  }, [task, defaultBackendId]);

  async function start() {
    if (!task || starting) return;
    setStarting(true);
    setError(null);
    try {
      const conversationId = await api.startTask(task.id, {
        backendId,
        model,
        effort: effort === DEFAULT ? null : effort,
        bypassPermissions: bypass,
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

  const modelOptions =
    backend?.kind === "ollama"
      ? (modelsByBackend[backend.id] ?? []).map((m) => ({
          value: m.name,
          name: m.name,
        }))
      : (acp?.modelOptions?.options ?? null);
  const effortOptions =
    backend?.kind === "acp"
      ? (acp?.effortOptions?.options ?? null)
      : NATIVE_EFFORTS.map((e) => ({ value: e, name: e }));

  return (
    <Dialog open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
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
        <Field>
          <FieldLabel>Agent</FieldLabel>
          <Select value={backendId} onValueChange={setBackendId}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {backends.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Model</FieldLabel>
            {modelOptions ? (
              <Select
                value={model || DEFAULT}
                onValueChange={(v) => setModel(v === DEFAULT ? "" : v)}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {backend?.kind === "acp" && (
                    <SelectItem value={DEFAULT}>Agent default</SelectItem>
                  )}
                  {modelOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  backend?.kind === "acp" ? "Agent default" : "Model id"
                }
              />
            )}
          </Field>
          <Field>
            <FieldLabel>Effort</FieldLabel>
            <Select
              value={effort}
              onValueChange={setEffort}
              disabled={!effortOptions}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT}>Default</SelectItem>
                {effortOptions?.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <CheckRow
            label="Run tools without asking (Bypass)"
            checked={bypass}
            onChange={setBypass}
          />
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
            disabled={!backend || starting}
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
