// Backdrop-click / Escape dismissal for a dialog that can hold unsaved
// edits. Pass the hook's `onOpenChange` to the Astryx `Dialog` (default
// `purpose`, so both dismiss it) and render its `confirm` next to it: with
// nothing unsaved the dialog just closes; otherwise an AlertDialog asks
// "Discard changes?" first. The dialog's own Cancel / close buttons are an
// explicit choice and should call `close` directly.
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { useEffect, useState } from "react";

export function useDiscardGuard(
  isOpen: boolean,
  isDirty: boolean,
  close: () => void,
) {
  const [isAsking, setIsAsking] = useState(false);

  // Closed some other way (saved, the task went away): drop the question.
  useEffect(() => {
    if (!isOpen) setIsAsking(false);
  }, [isOpen]);

  const onOpenChange = (open: boolean) => {
    if (open) return;
    if (isDirty) setIsAsking(true);
    else close();
  };

  const confirm = (
    <AlertDialog
      isOpen={isAsking}
      onOpenChange={setIsAsking}
      title="Discard changes?"
      description="What you've changed here hasn't been saved."
      actionLabel="Discard"
      cancelLabel="Keep editing"
      onAction={() => {
        setIsAsking(false);
        close();
      }}
    />
  );

  return { onOpenChange, confirm };
}

// Whether `current` differs from `initial`, for the form-state snapshots
// the dialogs keep: keys are compared regardless of order, and an unset
// (`null` / `undefined`) value counts the same as a missing one — an
// "unset" picked back in a Selector isn't an edit.
export function isEdited(initial: unknown, current: unknown): boolean {
  return normalize(initial) !== normalize(current);
}

function normalize(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v)
          .filter(([, x]) => x !== null && x !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    }
    return v;
  });
}
