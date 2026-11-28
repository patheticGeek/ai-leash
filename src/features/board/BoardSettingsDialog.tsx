import { Banner } from "@astryxdesign/core/Banner";
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
import { Heading, Text } from "@astryxdesign/core/Text";
import { useEffect, useState } from "react";
import { isEdited, useDiscardGuard } from "../../hooks/useDiscardGuard";
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
  // What it opened with, so a backdrop click only asks once it's changed.
  const [initial, setInitial] = useState<unknown>(null);

  // Fresh from the board every time it opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open
  useEffect(() => {
    if (open) {
      const fresh = {
        agent: board?.agentDefaults ?? {},
        parallel: board?.parallelMainCheckoutTasks ?? false,
      };
      setAgent(fresh.agent);
      setParallel(fresh.parallel);
      setError(null);
      setInitial(fresh);
    }
  }, [open]);

  const guard = useDiscardGuard(
    open,
    initial !== null && isEdited(initial, { agent, parallel }),
    () => onOpenChange(false),
  );

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
    }
    setSaving(false);
  }

  return (
    <>
      <Dialog isOpen={open} onOpenChange={guard.onOpenChange} width={576}>
        <Layout
          header={
            <DialogHeader
              title="Board settings"
              subtitle="Settings for every task on this board."
              onOpenChange={onOpenChange}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={5}>
                <VStack gap={2}>
                  <Heading level={4} weight="normal">
                    Agent
                  </Heading>
                  <Text type="supporting" color="secondary">
                    What a task's chat starts with, unless the task picks its
                    own or you change it when starting it. Default uses the
                    app's default agent (Settings &gt; Agents).
                  </Text>
                  <AgentFields
                    value={agent}
                    onChange={setAgent}
                    inheritLabel="Default"
                  />
                </VStack>
                {sharedCheckout && (
                  <CheckboxInput
                    label="Allow several tasks in progress at once"
                    description="This project isn't a git repository, so started tasks share its one checkout and can change the same files."
                    value={parallel}
                    onChange={setParallel}
                  />
                )}
                {error && (
                  <Banner
                    status="error"
                    title="Couldn't save the board settings"
                    description={error}
                  />
                )}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  variant="secondary"
                  label="Cancel"
                  onClick={() => onOpenChange(false)}
                />
                <Button
                  variant="primary"
                  label="Save"
                  isDisabled={saving}
                  onClick={save}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
      {guard.confirm}
    </>
  );
}
