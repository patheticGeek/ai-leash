import { Icon } from "@astryxdesign/core/Icon";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import * as stylex from "@stylexjs/stylex";
import { Columns2, MessageSquare, SquareKanban } from "lucide-react";
import {
  type BoardLayout,
  setBoardLayout,
  useBoardLayout,
} from "./boardLayout";

const styles = stylex.create({
  root: { flexShrink: 0 },
});

// Board / Both / Chat, in the title bar's end slot while a project's board
// is open, in place of Open in external editor and the Actions button.
export default function BoardLayoutSwitch() {
  const layout = useBoardLayout();
  return (
    <SegmentedControl
      label="Board layout"
      size="sm"
      value={layout}
      onChange={(value) => setBoardLayout(value as BoardLayout)}
      xstyle={styles.root}
    >
      <SegmentedControlItem
        value="board"
        label="Board"
        icon={<Icon icon={SquareKanban} size="sm" />}
      />
      <SegmentedControlItem
        value="both"
        label="Both"
        icon={<Icon icon={Columns2} size="sm" />}
      />
      <SegmentedControlItem
        value="chat"
        label="Chat"
        icon={<Icon icon={MessageSquare} size="sm" />}
      />
    </SegmentedControl>
  );
}
