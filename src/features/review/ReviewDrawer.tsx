import { ChatComposerDrawer } from "@astryxdesign/core/Chat";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { MessageSquare } from "lucide-react";
import { useActiveCheckoutPath } from "../../lib/useActiveCheckoutPath";
import { useAppStore } from "../../store";
import { type ReviewComment, relativePath } from "./reviewComments";

function shortLine(start: number, end: number) {
  return start === end ? `${start}` : `${start}–${end}`;
}

// The composer's drawer of draft review comments (left in the file editor —
// see `FileEditorTab`): one token per comment, `path:lines`, its text in
// the tooltip. Clicking one opens its file; × deletes it. "Send review" is
// beside Send (`ChatComposer`), since the drawer can collapse.
export default function ReviewDrawer({
  sessionId,
  comments,
}: {
  sessionId: string;
  comments: ReviewComment[];
}) {
  const checkoutPath = useActiveCheckoutPath();
  const openFile = useAppStore((s) => s.openFile);
  const deleteReviewComment = useAppStore((s) => s.deleteReviewComment);
  return (
    <ChatComposerDrawer
      label="Review comments"
      count={comments.length}
      aria-label="Review comments"
    >
      {comments.map((c) => {
        const rel = relativePath(c.path, checkoutPath);
        return (
          <Tooltip
            key={c.id}
            content={<Text maxLines={8}>{c.body}</Text>}
            delay={600}
          >
            <Token
              label={`${rel}:${shortLine(c.startLine, c.endLine)}`}
              icon={<MessageSquare size={14} />}
              onClick={() =>
                void openFile(c.path, c.path.split("/").pop() ?? c.path)
              }
              onRemove={() => deleteReviewComment(sessionId, c.id)}
            />
          </Tooltip>
        );
      })}
    </ChatComposerDrawer>
  );
}
