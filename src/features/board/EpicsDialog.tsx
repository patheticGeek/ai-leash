import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Input } from "@/ui/input";
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
        <Button variant="ghost" size="icon-sm" title="Colour">
          <EpicDot color={color} className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto gap-1 p-1.5">
        {EPIC_COLORS.map((c) => (
          <Button
            key={c}
            variant="ghost"
            size="icon-sm"
            title={c}
            onClick={() => {
              onChange(c);
              setOpen(false);
            }}
            className={cn(c === color && "bg-white/10")}
          >
            <EpicDot color={c} className="size-3" />
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

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
      <Input
        variant="unstyled"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
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
        className="flex-1 px-1 py-1"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        title={epic.archived ? "Unarchive" : "Archive"}
        onClick={() =>
          void api.updateEpic(epic.id, { archived: !epic.archived })
        }
      >
        {epic.archived ? <ArchiveRestore /> : <Archive />}
      </Button>
      <Button
        variant="danger"
        size="icon-sm"
        title="Delete epic (its tasks stay, ungrouped)"
        onClick={() => void api.deleteEpic(epic.id)}
      >
        <Trash2 />
      </Button>
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
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New epic"
          />
          <Button
            type="submit"
            variant="chip-primary"
            size="md"
            disabled={!title.trim()}
          >
            <Plus size={14} />
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
