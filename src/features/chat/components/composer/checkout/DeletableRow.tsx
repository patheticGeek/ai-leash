import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack } from "@astryxdesign/core/Layout";
import { ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { Check, Trash2, X } from "lucide-react";
import { useState } from "react";
import { revealOnGroupHover } from "@/lib/utils";

// A `PickerList` row — reachable with the search box's arrow keys — that's a
// plain select row until its trash icon is clicked, then swaps in place for
// a "delete this?" confirm strip, and again for an error (with a
// force-delete retry) if the plain delete git refuses — e.g. a dirty
// worktree or an unmerged branch. The confirm/error strips are rows with no
// click action of their own, just their buttons. Kept as a strip *within*
// the row rather than a native `confirm()` dialog so the popover never grows
// a second, heavier layer of modal-ness.
export default function DeletableRow({
  label,
  active,
  isHighlighted,
  onHighlight,
  indexProps,
  deletable,
  selectDisabled,
  onSelect,
  onDelete,
}: {
  label: string;
  active: boolean;
  isHighlighted: boolean;
  onHighlight: () => void;
  indexProps: { "data-picker-index": number };
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
      <ListItem
        {...indexProps}
        label={
          <Text type="supporting" color="secondary">
            Delete {label}?
          </Text>
        }
        endContent={
          <HStack gap={1}>
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
              variant="destructive"
              label={`Delete ${label}`}
              icon={<Check size={12} />}
              isDisabled={phase === "deleting"}
              onClick={() => runDelete(false)}
            />
          </HStack>
        }
      />
    );
  }

  if (phase === "error") {
    return (
      <ListItem
        {...indexProps}
        label={<span className="text-xs text-red-400">{error}</span>}
        description={
          <HStack gap={1.5} justify="end">
            <Button
              size="sm"
              variant="ghost"
              label="Cancel"
              onClick={() => setPhase("idle")}
            />
            <Button
              size="sm"
              variant="destructive"
              label="Force delete"
              onClick={() => runDelete(true)}
            />
          </HStack>
        }
      />
    );
  }

  return (
    <ListItem
      {...indexProps}
      className="group"
      label={label}
      isSelected={isHighlighted}
      isDisabled={selectDisabled}
      onMouseEnter={onHighlight}
      onClick={onSelect}
      endContent={
        <HStack gap={1} align="center">
          {deletable && (
            <IconButton
              variant="ghost"
              size="sm"
              label={`Delete ${label}`}
              icon={<Trash2 size={12} />}
              className={isHighlighted ? undefined : revealOnGroupHover}
              onClick={(e) => {
                e.stopPropagation();
                setPhase("confirm");
              }}
            />
          )}
          {active && <Check size={14} />}
        </HStack>
      }
    />
  );
}
