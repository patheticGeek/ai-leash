import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Pencil, Trash2 } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import Markdown from "../../ui/Markdown";
import { lineLabel } from "./reviewComments";

// The box for writing a comment: a new one under the picked lines, or an
// existing one being edited. Ctrl/Cmd+Enter saves, Escape cancels.
function CommentForm({
  initial,
  saveLabel,
  onSave,
  onCancel,
}: {
  initial: string;
  saveLabel: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initial);
  const canSave = body.trim().length > 0;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canSave) {
      e.preventDefault();
      onSave(body.trim());
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <VStack gap={2} onKeyDown={onKeyDown}>
      <TextArea
        label="Comment"
        isLabelHidden
        value={body}
        onChange={setBody}
        placeholder="Leave a comment for the agent"
        rows={3}
        size="sm"
        hasAutoFocus
      />
      <HStack gap={2} hAlign="end">
        <Button variant="ghost" size="sm" label="Cancel" onClick={onCancel} />
        <Button
          variant="primary"
          size="sm"
          label={saveLabel}
          isDisabled={!canSave}
          onClick={() => onSave(body.trim())}
          tooltip="Ctrl+Enter"
        />
      </HStack>
    </VStack>
  );
}

// One inline thread under a file's lines in the editor (portalled into a
// CodeMirror block widget — see `reviewEditor.ts`): a draft review comment
// with Edit / Delete, or, with no `body`, the box for a new one.
export default function ReviewThread({
  startLine,
  endLine,
  body,
  isOutdated = false,
  onSave,
  onCancel,
  onDelete,
}: {
  startLine: number;
  endLine: number;
  // Undefined: a new comment being written.
  body?: string;
  isOutdated?: boolean;
  onSave: (body: string) => void;
  // A new comment's Cancel.
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(body === undefined);
  const where = lineLabel(startLine, endLine);
  const heading = isOutdated
    ? `Comment on ${where} · outdated, the code changed`
    : `Comment on ${where}`;

  return (
    <Card padding={2} variant="muted">
      <VStack gap={1.5}>
        <HStack gap={2} hAlign="between" vAlign="center">
          <Text type="supporting" color="secondary">
            {heading}
          </Text>
          {body !== undefined && !isEditing && (
            <HStack gap={0.5}>
              <IconButton
                variant="ghost"
                size="sm"
                label="Edit comment"
                tooltip="Edit"
                icon={<Pencil size={14} />}
                onClick={() => setIsEditing(true)}
              />
              <IconButton
                variant="ghost"
                size="sm"
                label="Delete comment"
                tooltip="Delete"
                icon={<Trash2 size={14} />}
                onClick={onDelete}
              />
            </HStack>
          )}
        </HStack>
        {isEditing ? (
          <CommentForm
            initial={body ?? ""}
            saveLabel={body === undefined ? "Comment" : "Save"}
            onSave={(next) => {
              onSave(next);
              setIsEditing(false);
            }}
            onCancel={() =>
              body === undefined ? onCancel?.() : setIsEditing(false)
            }
          />
        ) : (
          <Markdown content={body ?? ""} />
        )}
      </VStack>
    </Card>
  );
}
