import { Columns2, MessageSquare, SquareKanban } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/ui/toggle-group";
import {
  type BoardLayout,
  setBoardLayout,
  useBoardLayout,
} from "./boardLayout";

// Board / Both / Chat, in the title bar while a project's board is open.
export default function BoardLayoutSwitch() {
  const layout = useBoardLayout();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0}
      variant="outline"
      value={layout}
      onValueChange={(value) => value && setBoardLayout(value as BoardLayout)}
      className="shrink-0"
    >
      <ToggleGroupItem value="board" title="Only the board">
        <SquareKanban />
        Board
      </ToggleGroupItem>
      <ToggleGroupItem value="both" title="The board with its chat beside it">
        <Columns2 />
        Both
      </ToggleGroupItem>
      <ToggleGroupItem value="chat" title="Only the project chat">
        <MessageSquare />
        Chat
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
