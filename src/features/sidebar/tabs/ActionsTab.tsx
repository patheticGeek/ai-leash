import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  Check,
  Pencil,
  Play,
  Plus,
  Square,
  SquareTerminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { type ActionSummary, api } from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";
import { useActions } from "../../actions/useActions";
import {
  PanelEmptyState,
  PanelErrorState,
  SkeletonRows,
} from "./PanelListState";

const emptyForm = { name: "", command: "" };

// How the action's current or last run stands. A run that exited on its own
// with a non-zero code is the one worth flagging.
function runState(action: ActionSummary) {
  const failed =
    action.status === "exited" &&
    action.exitCode !== null &&
    action.exitCode !== 0;
  if (action.running) return { variant: "success", label: "Running" } as const;
  if (failed) {
    return { variant: "error", label: `Exited ${action.exitCode}` } as const;
  }
  if (action.status === "exited") {
    return { variant: "neutral", label: "Exited" } as const;
  }
  if (action.status === "stopped") {
    return { variant: "neutral", label: "Stopped" } as const;
  }
  return { variant: "neutral", label: "Not started" } as const;
}

function RunStatusDot({ action }: { action: ActionSummary }) {
  const { variant, label } = runState(action);
  const tooltip = action.endedAt
    ? `${label} · ended ${new Date(action.endedAt * 1000).toLocaleTimeString()}`
    : label;
  return <StatusDot variant={variant} label={label} tooltip={tooltip} />;
}

// The side panel's Actions tab: the checkout's Actions as compact rows
// (`List` in a zero-padding section) with Add action in a divided footer,
// where the add / edit form opens too.
export default function ActionsTab() {
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const { actions, checkoutPath, isLoading, error, refetch } = useActions();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(action: ActionSummary) {
    setEditingId(action.id);
    setForm({ name: action.name, command: action.command });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function saveForm() {
    const name = form.name.trim();
    const command = form.command.trim();
    if (!name || !command || !checkoutPath) return;
    if (editingId) {
      await api.updateAction(checkoutPath, editingId, name, command);
    } else {
      await api.createAction(checkoutPath, name, command);
    }
    cancelForm();
  }

  async function remove(id: string) {
    if (!checkoutPath) return;
    await api.deleteAction(checkoutPath, id);
  }

  async function toggle(action: ActionSummary) {
    if (!checkoutPath) return;
    if (action.running) {
      await api.stopAction(checkoutPath, action.id);
    } else {
      await api.runAction(checkoutPath, action.id);
      openTerminal(action);
    }
  }

  function openTerminal(action: ActionSummary) {
    openPanelTab("action", { path: action.id, label: action.name });
  }

  let content: ReactNode;
  if (isLoading) {
    content = <SkeletonRows />;
  } else if (error && actions.length === 0) {
    content = (
      <PanelErrorState
        title="Couldn't load actions"
        error={error}
        onRetry={() => void refetch()}
      />
    );
  } else if (actions.length === 0) {
    content = (
      <PanelEmptyState
        icon={Zap}
        title="No actions"
        description="Save a command you run often, like a dev server or a test watcher, and start it from here. The agent can start and stop them too."
        action={
          showForm ? undefined : (
            <Button
              label="Add action"
              size="sm"
              variant="primary"
              icon={<Icon icon={Plus} size="sm" />}
              onClick={startAdd}
            />
          )
        }
      />
    );
  } else {
    content = (
      <List density="compact" hasDividers edge="padded">
        {actions.map((action) => (
          <ListItem
            key={action.id}
            onClick={() => openTerminal(action)}
            startContent={<RunStatusDot action={action} />}
            label={action.name}
            description={action.command}
            endContent={
              <HStack gap={1} vAlign="center">
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={
                    action.running
                      ? `Stop ${action.name}`
                      : `Run ${action.name}`
                  }
                  tooltip={action.running ? "Stop action" : "Run action"}
                  icon={
                    <Icon icon={action.running ? Square : Play} size="sm" />
                  }
                  onClick={() => void toggle(action)}
                />
                <MoreMenu
                  size="sm"
                  label={`${action.name} options`}
                  items={[
                    {
                      label: "Show output",
                      icon: <Icon icon={SquareTerminal} size="sm" />,
                      onClick: () => openTerminal(action),
                    },
                    {
                      label: "Edit",
                      icon: <Icon icon={Pencil} size="sm" />,
                      onClick: () => startEdit(action),
                    },
                    { type: "divider" },
                    {
                      label: "Delete",
                      icon: <Icon icon={Trash2} size="sm" />,
                      variant: "destructive",
                      onClick: () => void remove(action.id),
                    },
                  ]}
                />
              </HStack>
            }
          />
        ))}
      </List>
    );
  }

  // The empty state carries its own Add action button (and the loading and
  // error states have nothing to add to yet), so the footer only shows there
  // once the form is open.
  const footer = showForm ? (
    <LayoutFooter hasDivider padding={3}>
      <VStack gap={2}>
        <TextInput
          label="Name"
          size="sm"
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
          placeholder="e.g. dev"
        />
        <TextInput
          label="Command"
          size="sm"
          value={form.command}
          onChange={(command) => setForm({ ...form, command })}
          placeholder="e.g. npm run dev"
        />
        <HStack gap={2} hAlign="end">
          <Button
            variant="ghost"
            size="sm"
            label="Cancel"
            icon={<Icon icon={X} size="sm" />}
            onClick={cancelForm}
          />
          <Button
            variant="primary"
            size="sm"
            label={editingId ? "Save" : "Add"}
            icon={<Icon icon={Check} size="sm" />}
            onClick={() => void saveForm()}
          />
        </HStack>
      </VStack>
    </LayoutFooter>
  ) : actions.length === 0 ? undefined : (
    <LayoutFooter hasDivider padding={3}>
      <Button
        label="Add action"
        size="sm"
        icon={<Icon icon={Plus} size="sm" />}
        onClick={startAdd}
      />
    </LayoutFooter>
  );

  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0} isScrollable>
          {content}
        </LayoutContent>
      }
      footer={footer}
    />
  );
}
