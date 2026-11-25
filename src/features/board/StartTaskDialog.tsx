import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Icon } from "@astryxdesign/core/Icon";
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  VStack,
} from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { effortForSize } from "../../data/board";
import { type AgentDefaults, api, type Task } from "../../lib/tauriApi";
import { useAppStore } from "../../store";
import AgentFields, { resolveAgent } from "./AgentFields";

// Starts `task`'s chat (and worktree) with `agent` — what this dialog's
// Start does, and the task modals' Start / "Start it right away" with the
// task's settings over the board's. Resolves to the chat's id.
export function startTaskWith(
  task: Task,
  agent: AgentDefaults,
  follow = true,
): Promise<string> {
  return api.startTask(task.id, {
    backendId: agent.backendId ?? undefined,
    model: agent.model ?? undefined,
    effort: agent.thinking ?? null,
    agentMode: agent.agentMode ?? null,
    bypassPermissions: agent.permissionMode
      ? agent.permissionMode === "bypass"
      : undefined,
    engagedWithProject: follow,
  });
}

// Picks how to start a task — which agent, model, thinking level and
// permission its chat runs with, prefilled from the task's own defaults
// over the board's — then starts it. Opened by a card's Start.
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
      const conversationId = await startTaskWith(task, agent, follow);
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
            title={`Start task #${task?.number ?? ""}`}
            subtitle={task?.title}
            onOpenChange={onClose}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={5}>
              <Text color="secondary">
                The task gets its own chat, which starts working on it straight
                away. In a git repository it also gets its own worktree, on a
                new task/{task?.number}-… branch.
              </Text>
              <VStack gap={2}>
                <Heading level={4} weight="normal">
                  Agent
                </Heading>
                <AgentFields
                  value={agent}
                  onChange={setAgent}
                  inheritLabel="Default"
                />
                {!agent.thinking && sizeThinking && (
                  <Text type="supporting" color="secondary">
                    Our own providers think at {sizeThinking} effort for a task
                    this size unless you pick otherwise.
                  </Text>
                )}
              </VStack>
              <VStack gap={2}>
                <CheckboxInput
                  label="The project chat follows it"
                  description="Its updates wake the project chat."
                  value={follow}
                  onChange={setFollow}
                />
                <CheckboxInput
                  label="Open its chat after starting"
                  value={openAfter}
                  onChange={setOpenAfter}
                />
              </VStack>
              {error && (
                <Banner
                  status="error"
                  title="Couldn't start the task"
                  description={error}
                />
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button variant="secondary" label="Cancel" onClick={onClose} />
              <Button
                variant="primary"
                label={starting ? "Starting…" : "Start"}
                icon={<Icon icon={Play} size="sm" />}
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
