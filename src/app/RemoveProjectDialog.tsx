import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { useState } from "react";
import { useConversations } from "../data/conversations";
import { withCleanup } from "../lib/withCleanup";
import { type RecentProject, useAppStore } from "../store";

// Confirms the sidebar's "Remove project" (a project group's ⋯ / right-click
// menu) — `removeProject` deletes the project's board and every
// conversation in it (board chat and task chats included), with no undo.
// The folder itself is left alone.
export default function RemoveProjectDialog({
  project,
  onClose,
}: {
  project: RecentProject | null;
  onClose: () => void;
}) {
  const removeProject = useAppStore((s) => s.removeProject);
  const conversations = useConversations();
  const [removing, setRemoving] = useState(false);
  const count = project
    ? conversations.filter((c) => c.projectRoot === project.path).length
    : 0;
  const chats =
    count === 0
      ? ""
      : ` and its ${count === 1 ? "conversation" : `${count} conversations`}`;

  async function remove() {
    if (!project) return;
    setRemoving(true);
    const path = project.path;
    await withCleanup(
      () => removeProject(path),
      () => {
        setRemoving(false);
        onClose();
      },
    );
  }

  return (
    <AlertDialog
      isOpen={!!project}
      onOpenChange={(open) => {
        if (!open && !removing) onClose();
      }}
      title="Remove project?"
      description={`“${project?.name ?? ""}” will be removed from AI Leash, and its board${chats} will be deleted for good. Files on disk aren't touched.`}
      actionLabel="Remove project"
      isActionLoading={removing}
      onAction={() => void remove()}
    />
  );
}
