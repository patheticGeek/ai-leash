import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Pencil, Play, Square, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { STATUS_LABELS } from "../../data/board";
import { useConversation } from "../../data/conversations";
import { qk } from "../../data/keys";
import { useGenerating } from "../../lib/generatingQuery";
import {
  type AgentDefaults,
  api,
  type ConversationSummary,
  type Epic,
  type Task,
  type TaskPatch,
} from "../../lib/tauriApi";
import { useAppStore } from "../../store";
import Markdown from "../../ui/Markdown";
import AgentFields, { AgentSummary, resolveAgent } from "./AgentFields";
import { startTaskWith } from "./StartTaskDialog";
import { useElapsed } from "./TaskCard";
import { STATUS_DOT } from "./TaskMeta";
import {
  CheckoutSection,
  ModalSection,
  projectName,
  TaskFieldRow,
  type TaskFields,
  TaskModalFrame,
} from "./taskModal";

// The last thing its chat's agent said, re-read whenever a turn ends.
function useLastReply(conversationId: string | null, isWorking: boolean) {
  const query = useQuery({
    queryKey: qk.taskLastReply(conversationId ?? ""),
    queryFn: async () => {
      const history = await api.loadConversationHistory(conversationId ?? "");
      for (let i = history.length - 1; i >= 0; i--) {
        const m = history[i];
        if (m.role === "assistant" && m.content.trim()) return m;
      }
      return null;
    },
    enabled: conversationId !== null,
    staleTime: 0,
  });
  const { refetch } = query;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch on each turn's end
  useEffect(() => {
    if (conversationId && !isWorking) void refetch();
  }, [isWorking]);
  return query.data ?? null;
}

function WorkingFor({ startedAtMs }: { startedAtMs: number }) {
  return (
    <Text weight="semibold" hasTabularNumbers>
      Working for {useElapsed(startedAtMs)}
    </Text>
  );
}

// "Its chat": Start (not started), or the chat's live state — a pulsing
// dot and elapsed time while it works, Stop, Open chat — and its last reply.
function ChatState({
  task,
  conversation,
  sharedCheckout,
  isStarting,
  onStart,
  onOpenChat,
}: {
  task: Task;
  conversation: ConversationSummary | undefined;
  sharedCheckout: boolean;
  isStarting: boolean;
  onStart: () => void;
  onOpenChat: () => void;
}) {
  const id = task.conversationId;
  const { active, startedAtMs } = useGenerating(id ?? "");
  const lastReply = useLastReply(id, active);

  if (!id) {
    const canStart = task.status !== "done";
    return (
      <Card variant="muted" padding={4}>
        <HStack gap={3} vAlign="center">
          <StatusDot variant="neutral" label="Not started" />
          <StackItem size="fill">
            <VStack gap={0}>
              <Text weight="semibold">Not started</Text>
              <Text type="supporting" color="secondary">
                {!canStart
                  ? "It was finished without a chat."
                  : sharedCheckout
                    ? "Starting opens its chat in the project's checkout."
                    : `Starting creates a worktree on a new task/${task.number}-… branch and opens its chat.`}
              </Text>
            </VStack>
          </StackItem>
          {canStart && (
            <Button
              variant="primary"
              label={isStarting ? "Starting…" : "Start"}
              icon={<Icon icon={Play} size="sm" />}
              isDisabled={isStarting}
              onClick={onStart}
            />
          )}
        </HStack>
      </Card>
    );
  }

  return (
    <Card variant="muted" padding={4}>
      <VStack gap={3}>
        <HStack gap={3} vAlign="center">
          {active ? (
            <StatusDot variant="accent" isPulsing label="Working" />
          ) : (
            <StatusDot
              variant={STATUS_DOT[task.status]}
              label={STATUS_LABELS[task.status]}
            />
          )}
          <StackItem size="fill">
            <VStack gap={0}>
              {active && startedAtMs != null ? (
                <WorkingFor startedAtMs={startedAtMs} />
              ) : (
                <Text weight="semibold">{active ? "Working" : "Idle"}</Text>
              )}
              {conversation && (
                <Text type="supporting" color="secondary">
                  {conversation.title ?? `Task #${task.number}`} · last active{" "}
                  <Timestamp
                    value={conversation.updatedAt}
                    format="relative"
                    isLive
                  />
                </Text>
              )}
            </VStack>
          </StackItem>
          {active && (
            <Button
              label="Stop"
              icon={<Icon icon={Square} size="sm" />}
              onClick={() => void api.cancelPrompt(id)}
            />
          )}
          <Button
            variant="primary"
            label="Open chat"
            icon={<Icon icon={ExternalLink} size="sm" />}
            onClick={onOpenChat}
          />
        </HStack>
        {lastReply && (
          <>
            <Divider />
            <VStack gap={1}>
              <Text type="supporting" color="secondary">
                Last reply ·{" "}
                <Timestamp value={lastReply.createdAt} format="time" />
              </Text>
              <Text color="primary" maxLines={6}>
                {lastReply.content}
              </Text>
            </VStack>
          </>
        )}
      </VStack>
    </Card>
  );
}

// The title: a Heading with an edit button, or a TextInput while editing
// (Enter or blur saves, Escape cancels).
function TitleField({
  title,
  onSave,
}: {
  title: string;
  onSave: (title: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  if (editing === null) {
    return (
      <HStack gap={2} vAlign="start" hAlign="between">
        <Heading level={2} maxLines={2}>
          {title}
        </Heading>
        <IconButton
          variant="ghost"
          size="sm"
          label="Edit title"
          tooltip="Edit title"
          icon={<Icon icon={Pencil} size="sm" />}
          onClick={() => setEditing(title)}
        />
      </HStack>
    );
  }
  const commit = () => {
    if (editing.trim() && editing !== title) onSave(editing.trim());
    setEditing(null);
  };
  return (
    <TextInput
      label="Title"
      isLabelHidden
      size="lg"
      hasAutoFocus
      value={editing}
      onChange={setEditing}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          // Cancel the edit, not the dialog.
          e.preventDefault();
          e.stopPropagation();
          setEditing(null);
        }
      }}
    />
  );
}

// The description: rendered Markdown with an edit button, or a TextArea
// with Cancel / Save while editing.
function DescriptionField({
  description,
  onSave,
}: {
  description: string;
  onSave: (description: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <ModalSection
      title="Description"
      action={
        editing === null && (
          <IconButton
            variant="ghost"
            size="sm"
            label="Edit description"
            tooltip="Edit description"
            icon={<Icon icon={Pencil} size="sm" />}
            onClick={() => setEditing(description)}
          />
        )
      }
    >
      {editing === null ? (
        description.trim() ? (
          <Markdown content={description} />
        ) : (
          <Text color="secondary">No description</Text>
        )
      ) : (
        <VStack gap={2}>
          <TextArea
            label="Description"
            isLabelHidden
            rows={12}
            hasAutoFocus
            placeholder="What should the agent do? Markdown works."
            value={editing}
            onChange={setEditing}
          />
          <HStack gap={2} hAlign="end">
            <Button
              variant="secondary"
              size="sm"
              label="Cancel"
              onClick={() => setEditing(null)}
            />
            <Button
              variant="primary"
              size="sm"
              label="Save"
              onClick={() => {
                if (editing !== description) onSave(editing);
                setEditing(null);
              }}
            />
          </HStack>
        </VStack>
      )}
    </ModalSection>
  );
}

// Task details: opens on a card click (or its ⋯ > Open). Fields save as
// they change, so there's no Save. The agent settings stay editable until
// the task starts; after that the rail shows what its chat runs with.
export default function TaskDetailsDialog({
  task,
  onClose,
  projectRoot,
  epics,
  boardDefaults,
  sharedCheckout,
  onFinish,
}: {
  // The live task (from the board query); null when closed.
  task: Task | null;
  onClose: () => void;
  projectRoot: string;
  epics: Epic[];
  boardDefaults: AgentDefaults;
  sharedCheckout: boolean;
  // Moving it to Done goes through here instead of a plain status change —
  // see `useFinishTask`.
  onFinish: (task: Task) => Promise<void>;
}) {
  const openConversation = useAppStore((s) => s.openConversation);
  const conversation = useConversation(task?.conversationId);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const taskId = task?.id;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per task
  useEffect(() => {
    setError(null);
    setConfirmDelete(false);
  }, [taskId]);

  if (!task) return null;
  const isStarted = task.conversationId !== null;

  const save = (patch: TaskPatch) => {
    setError(null);
    api.updateTask(task.id, patch).catch((err) => setError(String(err)));
  };

  const setFields = (patch: Partial<TaskFields>) => {
    if (patch.status === "done" && task.status !== "done") {
      onFinish(task).catch((err) => setError(String(err)));
      return;
    }
    const { priority, ...rest } = patch;
    save(priority === null ? rest : { ...rest, priority });
  };

  async function start() {
    if (!task || starting) return;
    setStarting(true);
    setError(null);
    try {
      await startTaskWith(task, resolveAgent(task.agent, boardDefaults));
    } catch (err) {
      setError(String(err));
    } finally {
      setStarting(false);
    }
  }

  function openChat() {
    if (!task?.conversationId) return;
    onClose();
    void openConversation(task.conversationId);
  }

  async function remove() {
    if (!task) return;
    setDeleting(true);
    try {
      await api.deleteTask(task.id);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setError(String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <TaskModalFrame
        isOpen
        onOpenChange={(open) => !open && onClose()}
        title={`Task #${task.number}`}
        subtitle={`${projectName(projectRoot)} board`}
        endContent={
          <MoreMenu
            label="Task actions"
            alignment="end"
            items={[
              ...(task.conversationId
                ? [{ label: "Open its chat", onClick: openChat }]
                : []),
              ...(task.status !== "done"
                ? [
                    {
                      label: "Finish task",
                      onClick: () => setFields({ status: "done" }),
                    },
                  ]
                : []),
              { type: "divider" as const },
              {
                label: "Delete task",
                variant: "destructive" as const,
                onClick: () => setConfirmDelete(true),
              },
            ]}
          />
        }
        main={
          <>
            <VStack gap={3}>
              <TitleField
                key={task.id}
                title={task.title}
                onSave={(title) => save({ title })}
              />
              <TaskFieldRow
                value={task}
                onChange={setFields}
                epics={epics}
                canClearPriority={false}
              />
            </VStack>
            {error && (
              <Banner
                status="error"
                title="Couldn't update the task"
                description={error}
                isDismissable
                onDismiss={() => setError(null)}
              />
            )}
            <DescriptionField
              key={task.id}
              description={task.description}
              onSave={(description) => save({ description })}
            />
            <ModalSection title="Its chat">
              <ChatState
                task={task}
                conversation={conversation}
                sharedCheckout={sharedCheckout}
                isStarting={starting}
                onStart={start}
                onOpenChat={openChat}
              />
            </ModalSection>
          </>
        }
        rail={
          <>
            <ModalSection title="Agent">
              {isStarted ? (
                <AgentSummary conversation={conversation} />
              ) : (
                <>
                  <AgentFields
                    value={task.agent}
                    onChange={(agent) => save({ agent })}
                    inheritLabel="Board default"
                  />
                  <Text type="supporting" color="secondary">
                    Board default uses the board's settings when the task
                    starts.
                  </Text>
                </>
              )}
            </ModalSection>
            <CheckoutSection
              conversation={conversation}
              isStarted={isStarted}
              projectRoot={projectRoot}
              sharedCheckout={sharedCheckout}
            />
            <ModalSection title="Details">
              <MetadataList>
                <MetadataListItem label="Created">
                  <Timestamp
                    value={task.createdAt}
                    format="date_time"
                    type="body"
                    color="primary"
                  />
                </MetadataListItem>
                {task.startedAt !== null && (
                  <MetadataListItem label="Started">
                    <Timestamp
                      value={task.startedAt}
                      format="date_time"
                      type="body"
                      color="primary"
                    />
                  </MetadataListItem>
                )}
                {task.completedAt !== null && (
                  <MetadataListItem label="Finished">
                    <Timestamp
                      value={task.completedAt}
                      format="date_time"
                      type="body"
                      color="primary"
                    />
                  </MetadataListItem>
                )}
              </MetadataList>
            </ModalSection>
          </>
        }
        footer={
          <HStack gap={2} hAlign="between">
            <Button
              variant="destructive"
              label="Delete task"
              icon={<Icon icon={Trash2} size="sm" />}
              onClick={() => setConfirmDelete(true)}
            />
            <Button variant="secondary" label="Close" onClick={onClose} />
          </HStack>
        }
      />
      <AlertDialog
        isOpen={confirmDelete}
        onOpenChange={(open) => !open && !deleting && setConfirmDelete(false)}
        title={`Delete task #${task.number}?`}
        description={`“${task.title}” is removed from the board. Its chat, worktree and branch stay.`}
        actionLabel="Delete task"
        isActionLoading={deleting}
        onAction={remove}
      />
    </>
  );
}
