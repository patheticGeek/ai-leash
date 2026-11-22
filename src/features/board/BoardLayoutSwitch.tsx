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

// Board / Both / Chat, in the title bar while a project's board is open.
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
        icon={<SquareKanban size={14} />}
      />
      <SegmentedControlItem
        value="both"
        label="Both"
        icon={<Columns2 size={14} />}
      />
      <SegmentedControlItem
        value="chat"
        label="Chat"
        icon={<MessageSquare size={14} />}
      />
    </SegmentedControl>
  );
}
