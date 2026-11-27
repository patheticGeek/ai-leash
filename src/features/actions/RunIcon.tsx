import { Icon } from "@astryxdesign/core/Icon";
import { Play, Square } from "lucide-react";
import type { ActionSummary } from "../../lib/tauriApi";
import { runState } from "./runState";

// Play, or Stop while running, tinted by the run's state — the same tones
// the Actions tab's dots use (`runState`). Shared by the top bar's split
// button and its dropdown, and an Action's output tab in the tab strip, so
// they always agree. `neutralColor` is the idle tint: `inherit` to take a
// button's label colour, `secondary` beside the strip's other tab icons.
export function RunIcon({
  action,
  neutralColor = "inherit",
}: {
  action: ActionSummary;
  neutralColor?: "inherit" | "secondary";
}) {
  const { tone } = runState(action);
  return (
    <Icon
      icon={action.running ? Square : Play}
      size="sm"
      color={tone === "neutral" ? neutralColor : tone}
    />
  );
}
