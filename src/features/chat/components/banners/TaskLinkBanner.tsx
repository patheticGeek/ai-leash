import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import {
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link2, Undo2 } from "lucide-react";
import { useConversation } from "../../../../data/conversations";
import { api } from "../../../../lib/tauriApi";
import { useAppStore } from "../../../../store";
import { useConversationTask } from "../../hooks/useConversationTask";

const styles = stylex.create({
  // One quiet line at the end of the dock, only as wide as it needs. It sits
  // over the transcript scrolling under the floating composer, so it carries
  // a surface backdrop like the checkout pickers (`PickerTrigger`). Button's
  // hover fill is a layer over that, so it still shows.
  row: {
    alignSelf: "flex-end",
    backgroundColor: colorVars["--color-background-surface"],
    borderRadius: radiusVars["--radius-element"],
  },
  // Text before the button needs room from the backdrop's edge.
  leadingText: {
    paddingInlineStart: spacingVars["--spacing-2"],
  },
});

// A board task's chat: whether the project chat is following it. Followed,
// its replies are forwarded there. Taken over (the user sent or stopped
// here and chose to, or it was started by hand), none are, though the two
// can still message each other; "Hand back" has the project chat follow
// it again (see `board::messaging`). Followed, the line is a button that
// opens the project chat. A muted line above the message box, not a
// banner: it's state, not something that needs doing.
export default function TaskLinkBanner({
  sessionId,
}: {
  sessionId: string | null;
}) {
  const task = useConversationTask(sessionId);
  const projectRoot = useConversation(sessionId)?.projectRoot;
  const openProjectBoard = useAppStore((s) => s.openProjectBoard);
  if (!task || task.status === "done") return null;
  if (task.engagedWithProject) {
    return (
      <HStack vAlign="center" xstyle={styles.row}>
        <Button
          variant="ghost"
          size="sm"
          label={`The project chat is following #${task.number}`}
          icon={<Icon icon={Link2} size="sm" />}
          tooltip="Open the project chat"
          isDisabled={!projectRoot}
          onClick={() => projectRoot && void openProjectBoard(projectRoot)}
        />
      </HStack>
    );
  }
  return (
    <HStack gap={1} vAlign="center" xstyle={[styles.row, styles.leadingText]}>
      <Text type="supporting" color="secondary">
        You've taken over #{task.number}
      </Text>
      <Button
        variant="ghost"
        size="sm"
        label="Hand back to project chat"
        icon={<Icon icon={Undo2} size="sm" />}
        tooltip="Its replies go to the project chat again"
        onClick={() => void api.setTaskEngaged(task.id, true)}
      />
    </HStack>
  );
}
