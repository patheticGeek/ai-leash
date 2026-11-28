import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack, Layout, LayoutFooter } from "@astryxdesign/core/Layout";
import { useState } from "react";
import type { ConversationSummary } from "../data/conversations";
import { useGenerating } from "../lib/generatingQuery";
import { withCleanup } from "../lib/withCleanup";

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
    const id = conversation.id;
    await withCleanup(
      () => onConfirm(id),
      () => {
        setDeleting(false);
        onCancel();
      },
    );
  }

  return (
    // Not `AlertDialog`: that one always focuses Cancel, and this confirm
    // focuses Delete on open (Dialog honours `data-autofocus`).
    <Dialog
      isOpen={!!conversation}
      role="alertdialog"
      width={384}
      onOpenChange={(open) => {
        if (!open && !deleting) onCancel();
      }}
    >
      <Layout
        header={
          <DialogHeader
            title="Delete conversation?"
            subtitle={
              <>
                “{conversation?.title ?? "Untitled"}” and any sub-agents it
                spawned will be deleted for good.
                {generating && " It's still running and will be stopped first."}
              </>
            }
            hasDivider={false}
          />
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button
                variant="ghost"
                label="Cancel"
                isDisabled={deleting}
                onClick={onCancel}
              />
              <Button
                variant="destructive"
                label={deleting ? "Deleting…" : "Delete"}
                isDisabled={deleting}
                onClick={confirm}
                data-autofocus
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
