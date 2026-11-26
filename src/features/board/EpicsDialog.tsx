import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  StackItem,
  VStack,
} from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useDiscardGuard } from "../../hooks/useDiscardGuard";
import { api, type Epic } from "../../lib/tauriApi";
import { EPIC_COLORS, hexTokenColor } from "./TaskMeta";

const COLOR_OPTIONS = EPIC_COLORS.map((c) => ({
  value: c.hex,
  label: c.name,
}));

function colorSwatch(hex: string) {
  const name = EPIC_COLORS.find((c) => c.hex === hex)?.name ?? "Colour";
  return <Token size="sm" label={name} color={hexTokenColor(hex)} />;
}

// One epic: its colour (a tinted Token, as the board shows epics), its
// title (renamed on blur / Enter), archive and delete.
function EpicRow({ epic }: { epic: Epic }) {
  const [title, setTitle] = useState(epic.title);
  const color = epic.color.toLowerCase();
  return (
    <HStack gap={2} vAlign="center">
      <Selector
        label="Colour"
        isLabelHidden
        variant="ghost"
        size="sm"
        value={COLOR_OPTIONS.some((o) => o.value === color) ? color : undefined}
        placeholder="Colour"
        onChange={(hex) => void api.updateEpic(epic.id, { color: hex })}
        options={COLOR_OPTIONS}
        renderValue={(o) => colorSwatch(o.value)}
        renderOption={(o) => colorSwatch(o.value)}
      />
      <StackItem size="fill">
        <TextInput
          label="Epic title"
          isLabelHidden
          size="sm"
          width="100%"
          value={title}
          onChange={setTitle}
          onBlur={() => {
            if (title.trim() && title !== epic.title) {
              void api.updateEpic(epic.id, { title });
            } else {
              setTitle(epic.title);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </StackItem>
      {epic.archived && (
        <Text type="supporting" color="secondary">
          Archived
        </Text>
      )}
      <IconButton
        variant="ghost"
        size="sm"
        label={epic.archived ? "Unarchive" : "Archive"}
        tooltip={
          epic.archived
            ? "Unarchive"
            : "Archive (can't be picked for new tasks)"
        }
        icon={
          <Icon icon={epic.archived ? ArchiveRestore : Archive} size="sm" />
        }
        onClick={() =>
          void api.updateEpic(epic.id, { archived: !epic.archived })
        }
      />
      <IconButton
        variant="ghost"
        size="sm"
        label="Delete epic"
        tooltip="Delete epic (its tasks stay, ungrouped)"
        icon={<Icon icon={Trash2} size="sm" />}
        onClick={() => void api.deleteEpic(epic.id)}
      />
    </HStack>
  );
}

// Lists, renames, recolours, archives and deletes a board's epics.
export default function EpicsDialog({
  open,
  onOpenChange,
  projectRoot,
  epics,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRoot: string;
  epics: Epic[];
}) {
  const [title, setTitle] = useState("");
  // A typed-but-not-added epic is the one edit a dismissal could lose.
  const guard = useDiscardGuard(open, title.trim() !== "", () => {
    setTitle("");
    onOpenChange(false);
  });

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await api.createEpic(projectRoot, { title });
    setTitle("");
  }

  return (
    <>
      <Dialog isOpen={open} onOpenChange={guard.onOpenChange} width={576}>
        <Layout
          header={
            <DialogHeader
              title="Epics"
              subtitle="Group related tasks. Deleting an epic keeps its tasks."
              onOpenChange={onOpenChange}
            />
          }
          content={
            <LayoutContent>
              {epics.length === 0 ? (
                <EmptyState
                  isCompact
                  title="No epics yet"
                  description="Add one below, then pick it on a task."
                />
              ) : (
                <VStack gap={2}>
                  {epics.map((epic) => (
                    <EpicRow key={`${epic.id}:${epic.title}`} epic={epic} />
                  ))}
                </VStack>
              )}
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack as="form" gap={2} vAlign="center" onSubmit={add}>
                <StackItem size="fill">
                  <TextInput
                    label="New epic"
                    isLabelHidden
                    width="100%"
                    value={title}
                    onChange={setTitle}
                    placeholder="New epic"
                  />
                </StackItem>
                <Button
                  type="submit"
                  variant="primary"
                  label="Add epic"
                  icon={<Icon icon={Plus} size="sm" />}
                  isDisabled={!title.trim()}
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
