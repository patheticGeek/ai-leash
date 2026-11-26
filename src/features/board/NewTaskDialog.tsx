import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useEffect, useState } from "react";
import { isEdited } from "../../hooks/useDiscardGuard";
import {
  type AgentDefaults,
  api,
  type Epic,
  type TaskStatus,
} from "../../lib/tauriApi";
import AgentFields, { resolveAgent } from "./AgentFields";
import { startTaskWith } from "./StartTaskDialog";
import {
  CheckoutSection,
  ModalSection,
  projectName,
  TaskFieldRow,
  type TaskFields,
  TaskModalFrame,
} from "./taskModal";

interface Draft extends TaskFields {
  title: string;
  description: string;
  // Which agent its chat starts with; unset parts use the board's.
  agent: AgentDefaults;
}

const emptyDraft = (status: TaskStatus, epicId: string | null): Draft => ({
  title: "",
  description: "",
  status,
  priority: null,
  effort: null,
  epicId,
  agent: {},
});

// New task: the empty, editable version of Task details. Prefilled with
// the column (and epic lane) it was opened from. "Start it right away"
// (off by default) starts it on creation, with its agent settings over
// the board's and the project chat following it.
export default function NewTaskDialog({
  open,
  onOpenChange,
  projectRoot,
  epics,
  status = "todo",
  epicId = null,
  boardDefaults,
  sharedCheckout,
  onStartFailed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRoot: string;
  epics: Epic[];
  status?: TaskStatus;
  epicId?: string | null;
  boardDefaults: AgentDefaults;
  sharedCheckout: boolean;
  // "Start it right away" failed after the task was created: the dialog
  // closes anyway (a retry would create it twice) and reports it here.
  onStartFailed: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(status, epicId));
  const [startNow, setStartNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh fields every time it opens, not whatever was typed last time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open
  useEffect(() => {
    if (open) {
      setDraft(emptyDraft(status, epicId));
      setStartNow(false);
      setError(null);
    }
  }, [open]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function create() {
    if (!draft.title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { priority, ...rest } = draft;
      const task = await api.createTask(projectRoot, {
        ...rest,
        priority: priority ?? undefined,
      });
      onOpenChange(false);
      if (startNow) {
        startTaskWith(task, resolveAgent(task.agent, boardDefaults)).catch(
          (err) => onStartFailed(`#${task.number} was created: ${err}`),
        );
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <TaskModalFrame
      isOpen={open}
      onOpenChange={onOpenChange}
      isDirty={isEdited(emptyDraft(status, epicId), draft) || startNow}
      title="New task"
      subtitle={`${projectName(projectRoot)} board`}
      onSubmit={create}
      main={
        <>
          <TextInput
            label="Title"
            isLabelHidden
            size="lg"
            hasAutoFocus
            placeholder="Task title"
            value={draft.title}
            onChange={(title) => set({ title })}
          />
          <TaskFieldRow
            value={draft}
            onChange={set}
            epics={epics}
            canClearPriority
          />
          <ModalSection title="Description">
            <TextArea
              label="Description"
              isLabelHidden
              rows={12}
              placeholder="What should the agent do? Markdown works. This becomes the first message in the task's chat."
              value={draft.description}
              onChange={(description) => set({ description })}
            />
          </ModalSection>
          {error && (
            <Banner
              status="error"
              title="Couldn't create the task"
              description={error}
            />
          )}
        </>
      }
      rail={
        <>
          <ModalSection title="Agent">
            <AgentFields
              value={draft.agent}
              onChange={(agent) => set({ agent })}
              inheritLabel="Board default"
            />
            <Text type="supporting" color="secondary">
              Board default uses the board's settings when the task starts.
            </Text>
          </ModalSection>
          <CheckoutSection
            conversation={undefined}
            isStarted={false}
            projectRoot={projectRoot}
            sharedCheckout={sharedCheckout}
          />
        </>
      }
      footer={
        <HStack gap={2} hAlign="between" vAlign="center">
          <CheckboxInput
            label="Start it right away"
            value={startNow}
            onChange={setStartNow}
          />
          <HStack gap={2}>
            <Button
              variant="secondary"
              label="Cancel"
              onClick={() => onOpenChange(false)}
            />
            <Button
              type="submit"
              variant="primary"
              label={saving ? "Creating…" : "Create task"}
              isDisabled={!draft.title.trim() || saving}
            />
          </HStack>
        </HStack>
      }
    />
  );
}
