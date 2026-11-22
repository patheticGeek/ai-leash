import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Check, Trash2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CommandItem } from "@/ui/command";

// A `cmdk` item — arrow-key/typeahead navigable via `Command`'s own keyboard
// handling — that's a plain select row until its trash icon is clicked, then
// swaps in place for a "delete this?" confirm strip, and again for an error
// (with a force-delete retry) if the plain delete git refuses — e.g. a dirty
// worktree or an unmerged branch. The confirm/error strips render as plain
// (non-`CommandItem`) rows: `cmdk` still filters/positions them by DOM order,
// but they fall out of keyboard nav and stay clickable without fighting
// `CommandItem`'s own `disabled` styling (which sets `pointer-events-none`
// on the whole row, including the strip's own buttons). Kept as a strip
// *within* the row rather than a native `confirm()` dialog so the popover
// never grows a second, heavier layer of modal-ness.
export default function DeletableRow({
  value,
  label,
  active,
  deletable,
  selectDisabled,
  onSelect,
  onDelete,
}: {
  // What `cmdk` matches the search query against — not necessarily `label`
  // (see `WorktreePicker`, which also searches the checked-out branch name).
  value: string;
  label: string;
  active: boolean;
  deletable: boolean;
  selectDisabled?: boolean;
  onSelect: () => void;
  onDelete: (force: boolean) => Promise<void>;
}) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "deleting" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function runDelete(force: boolean) {
    setPhase("deleting");
    try {
      await onDelete(force);
      // Success removes this row from the parent's list; nothing left to do.
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  if (phase === "confirm" || phase === "deleting") {
    return (
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <span className="truncate text-xs text-zinc-500">Delete {label}?</span>
        <div className="flex shrink-0 gap-1">
          <IconButton
            size="sm"
            variant="ghost"
            label="Cancel"
            icon={<X size={12} />}
            isDisabled={phase === "deleting"}
            onClick={() => setPhase("idle")}
          />
          <IconButton
            size="sm"
            variant="danger"
            label={`Delete ${label}`}
            icon={<Check size={12} />}
            isDisabled={phase === "deleting"}
            onClick={() => runDelete(false)}
          />
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex flex-col gap-1 px-2 py-1.5">
        <span className="text-xs text-red-400">{error}</span>
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            label="Cancel"
            onClick={() => setPhase("idle")}
          />
          <Button
            size="sm"
            variant="danger"
            label="Force delete"
            onClick={() => runDelete(true)}
          />
        </div>
      </div>
    );
  }

  return (
    <CommandItem
      value={value}
      disabled={selectDisabled}
      data-checked={active}
      checkIcon
      onSelect={onSelect}
      className="cursor-pointer justify-between gap-2 flex"
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          active ? "text-zinc-100" : "text-zinc-300",
        )}
      >
        {label}
      </span>
      {deletable && (
        <IconButton
          variant="danger"
          size="sm"
          label={`Delete ${label}`}
          icon={<Trash2 size={12} />}
          className="opacity-0 group-hover/command-item:opacity-100 group-data-selected/command-item:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setPhase("confirm");
          }}
        />
      )}
    </CommandItem>
  );
}
