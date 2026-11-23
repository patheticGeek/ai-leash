import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import { Popover } from "@astryxdesign/core/Popover";
import { TextInput } from "@astryxdesign/core/TextInput";
import * as stylex from "@stylexjs/stylex";
import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { cn } from "@/lib/utils";
import { api, type Epic } from "../../lib/tauriApi";
import { EpicDot } from "./TaskMeta";

// Same palette Rust cycles through for new epics (`db/epics.rs`).
const EPIC_COLORS = [
  "#f97316",
  "#a855f7",
  "#22c55e",
  "#3b82f6",
  "#ec4899",
  "#eab308",
  "#14b8a6",
  "#ef4444",
];

function ColorPicker({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      label="Colour"
      placement="below"
      alignment="start"
      width="max-content"
      padding={1.5}
      content={
        <HStack gap={1}>
          {EPIC_COLORS.map((c) => (
            <IconButton
              key={c}
              variant={c === color ? "secondary" : "ghost"}
              size="sm"
              label={c}
              tooltip={c}
              icon={<EpicDot color={c} className="size-3" />}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            />
          ))}
        </HStack>
      }
    >
      <IconButton
        variant="ghost"
        size="sm"
        label="Colour"
        tooltip="Colour"
        icon={<EpicDot color={color} className="size-3" />}
      />
    </Popover>
  );
}

const styles = stylex.create({
  grow: { flex: 1, minWidth: 0 },
});

function EpicRow({ epic }: { epic: Epic }) {
  const [title, setTitle] = useState(epic.title);
  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-white/[0.03]",
        epic.archived && "opacity-50",
      )}
    >
      <ColorPicker
        color={epic.color}
        onChange={(color) => void api.updateEpic(epic.id, { color })}
      />
      <TextInput
        label="Epic title"
        isLabelHidden
        size="sm"
        containerXstyle={styles.grow}
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
      <IconButton
        variant="ghost"
        size="sm"
        label={epic.archived ? "Unarchive" : "Archive"}
        tooltip={epic.archived ? "Unarchive" : "Archive"}
        icon={
          epic.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />
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
        icon={<Trash2 size={14} />}
        onClick={() => void api.deleteEpic(epic.id)}
      />
    </div>
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

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await api.createEpic(projectRoot, { title });
    setTitle("");
  }

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} width={384}>
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
            {epics.length === 0 && (
              <p className="py-4 text-center text-xs text-zinc-600">
                No epics yet
              </p>
            )}
            {epics.map((epic) => (
              <EpicRow key={`${epic.id}:${epic.title}`} epic={epic} />
            ))}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <form onSubmit={add} className="flex gap-2">
              <TextInput
                label="New epic"
                isLabelHidden
                containerXstyle={styles.grow}
                value={title}
                onChange={setTitle}
                placeholder="New epic"
              />
              <Button
                type="submit"
                variant="primary"
                label="Add"
                icon={<Plus size={14} />}
                isDisabled={!title.trim()}
              />
            </form>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
