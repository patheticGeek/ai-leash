import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import * as stylex from "@stylexjs/stylex";
import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton
          variant="ghost"
          size="sm"
          label="Colour"
          tooltip="Colour"
          icon={<EpicDot color={color} className="size-3" />}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto gap-1 p-1.5">
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
      </PopoverContent>
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
        variant="danger"
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Epics</DialogTitle>
          <DialogDescription>
            Group related tasks. Deleting an epic keeps its tasks.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-80 flex-col overflow-y-auto">
          {epics.length === 0 && (
            <p className="py-4 text-center text-xs text-zinc-600">
              No epics yet
            </p>
          )}
          {epics.map((epic) => (
            <EpicRow key={`${epic.id}:${epic.title}`} epic={epic} />
          ))}
        </div>
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
            variant="chip-primary"
            label="Add"
            icon={<Plus size={14} />}
            isDisabled={!title.trim()}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
