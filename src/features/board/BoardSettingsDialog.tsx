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
import { useEffect, useState } from "react";
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
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      purpose="form"
      width={576}
    >
      <Layout
        header={
          <DialogHeader
            title="Board settings"
            subtitle="The agent a task's chat starts with, unless the task picks its own or you change it when starting it."
            onOpenChange={onOpenChange}
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
              {sharedCheckout && (
                <CheckboxInput
                  label="Allow several tasks in progress at once"
                  description="This project isn't a git repository, so started tasks share its one checkout and can change the same files."
                  value={parallel}
                  onChange={setParallel}
                />
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button
                variant="ghost"
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
  );
}
