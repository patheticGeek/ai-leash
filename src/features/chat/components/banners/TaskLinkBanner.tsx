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
import { api } from "../../../../lib/tauriApi";
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
    paddingInlineStart: spacingVars["--spacing-2"],
  },
  // Without a button the text needs padding on both sides and some height.
  textOnly: {
    paddingInlineEnd: spacingVars["--spacing-2"],
    paddingBlock: spacingVars["--spacing-1"],
  },
});

// A board task's chat: whether the project chat is following it. Followed,
// its replies are forwarded there. Taken over (the user sent or stopped
// here and chose to, or it was started by hand), none are, though the two
// can still message each other; "Hand back" has the project chat follow
// it again (see `board::messaging`). A muted line above the message box,
// not a banner: it's state, not something that needs doing.
export default function TaskLinkBanner({
  sessionId,
}: {
  sessionId: string | null;
}) {
  const task = useConversationTask(sessionId);
  if (!task || task.status === "done") return null;
  if (task.engagedWithProject) {
    return (
      <HStack gap={1} vAlign="center" xstyle={[styles.row, styles.textOnly]}>
        <Icon icon={Link2} size="sm" color="secondary" />
        <Text type="supporting" color="secondary">
          The project chat is following #{task.number}
        </Text>
      </HStack>
    );
  }
  return (
    <HStack gap={1} vAlign="center" xstyle={styles.row}>
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
