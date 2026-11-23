import { Button } from "@astryxdesign/core/Button";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@astryxdesign/core/DropdownMenu";
import { IconButton } from "@astryxdesign/core/IconButton";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, Play, Square } from "lucide-react";
import { useActions } from "../features/actions/useActions";
import { type ActionSummary, api } from "../lib/tauriApi";
import { useAppStore } from "../store";

// The action last run in this checkout (persisted by the backend, so it
// survives a stop or app restart) is "current" and shown on the collapsed
// button; falls back to the first action defined when none has ever been run
// or the last-run one was deleted.
const styles = stylex.create({
  group: { flexShrink: 0 },
  // A long action name truncates instead of crowding the title.
  current: { minWidth: 0, maxWidth: "10rem" },
});

function pickCurrent(actions: ActionSummary[]): ActionSummary | null {
  return actions.find((a) => a.lastRun) ?? actions[0] ?? null;
}

// Title-bar shortcut for the Actions tab (`ActionsTab.tsx`): a split button
// showing the last-ran action (or the first one, if none has run yet) that
// starts/stops it on click, plus a dropdown for jumping to any other
// action without having to open the side panel.
export default function TitleBarActions() {
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const { actions, checkoutPath } = useActions();

  const current = pickCurrent(actions);
  if (!current) return null;

  const rest = actions.filter((a) => a.id !== current.id);

  async function handleToggle(action: ActionSummary) {
    if (!checkoutPath) return;
    if (action.running) {
      await api.stopAction(checkoutPath, action.id);
    } else {
      await api.runAction(checkoutPath, action.id);
      openPanelTab("action", { path: action.id, label: action.name });
    }
  }

  return (
    <ButtonGroup label="Actions" size="sm" xstyle={styles.group}>
      <Button
        variant="secondary"
        size="sm"
        label={current.name}
        icon={current.running ? <Square size={11} /> : <Play size={11} />}
        onClick={() => handleToggle(current)}
        tooltip={
          current.running ? `Stop ${current.name}` : `Run ${current.name}`
        }
        xstyle={styles.current}
      />
      {rest.length > 0 && (
        <DropdownMenu
          placement="below"
          alignment="end"
          menuWidth="14rem"
          renderTrigger={(triggerProps) => (
            <IconButton
              {...triggerProps}
              variant="secondary"
              size="sm"
              label="Other actions"
              tooltip="Other actions"
              icon={<ChevronDown size={12} />}
            />
          )}
        >
          {rest.map((action) => (
            <DropdownMenuItem
              key={action.id}
              icon={
                action.running ? (
                  <Square size={11} className="shrink-0 text-warning" />
                ) : (
                  <Play size={11} className="shrink-0 text-zinc-500" />
                )
              }
              label={action.name}
              endContent={
                action.running && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-warning">
                    running
                  </span>
                )
              }
              onClick={() => void handleToggle(action)}
            />
          ))}
        </DropdownMenu>
      )}
    </ButtonGroup>
  );
}
