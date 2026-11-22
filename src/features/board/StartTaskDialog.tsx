import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  VStack,
} from "@astryxdesign/core/Layout";
import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { effortForSize } from "../../data/board";
import { type AgentDefaults, api, type Task } from "../../lib/tauriApi";
import { useAppStore } from "../../store";
import AgentFields, { resolveAgent } from "./AgentFields";

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
    <Dialog
      isOpen={task !== null}
      onOpenChange={(open) => !open && onClose()}
      purpose="form"
      width={576}
    >
      <Layout
        header={
          <DialogHeader
            title={`Start #${task?.number ?? ""} ${task?.title ?? ""}`}
            subtitle={
              <>
                The task gets its own chat, which starts working on it straight
                away. In a git repository it also gets its own worktree, on a
                new <code>task/{task?.number}-…</code> branch.
              </>
            }
            onOpenChange={onClose}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              <AgentFields
                value={agent}
                onChange={setAgent}
                inheritLabel="Default"
              />
              {!agent.thinking && sizeThinking && (
                <p className="text-xs text-zinc-500">
                  Our own providers think at <strong>{sizeThinking}</strong>{" "}
                  effort for a task this size unless you pick otherwise.
                </p>
              )}
              <VStack gap={2}>
                <CheckboxInput
                  label="The project chat follows it (its updates wake the project chat)"
                  value={follow}
                  onChange={setFollow}
                />
                <CheckboxInput
                  label="Open its chat after starting"
                  value={openAfter}
                  onChange={setOpenAfter}
                />
              </VStack>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button variant="ghost" label="Cancel" onClick={onClose} />
              <Button
                variant="primary"
                label={starting ? "Starting…" : "Start"}
                icon={<Play size={14} />}
                isDisabled={starting}
                onClick={start}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
