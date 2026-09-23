import { useState } from "react";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import type { ConversationSummary } from "../data/conversations";
import { useGenerating } from "../lib/generatingQuery";

// Confirms a sidebar delete before it happens — deleting drops the whole
// transcript and every sub-agent it spawned, with no undo. A still-running
// turn is stopped first by the backend (`delete_conversation`'s
// `cancel_and_await_idle`), so this only needs to say so.
export default function DeleteConversationDialog({
  conversation,
  onCancel,
  onConfirm,
}: {
  conversation: ConversationSummary | null;
  onCancel: () => void;
  onConfirm: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const generating = useGenerating(conversation?.id ?? "").active;

  async function confirm() {
    if (!conversation) return;
    setDeleting(true);
    try {
      await onConfirm(conversation.id);
    } finally {
      setDeleting(false);
      onCancel();
    }
  }

  return (
    <Dialog
      open={!!conversation}
      onOpenChange={(open) => {
        if (!open && !deleting) onCancel();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete conversation?</DialogTitle>
          <DialogDescription>
            “{conversation?.title ?? "Untitled"}” and any sub-agents it spawned
            will be deleted for good.
            {generating && " It's still running and will be stopped first."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            size="md"
            disabled={deleting}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            variant="chip-danger"
            size="md"
            disabled={deleting}
            onClick={confirm}
            autoFocus
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
