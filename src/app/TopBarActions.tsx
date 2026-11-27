import { Button } from "@astryxdesign/core/Button";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown } from "lucide-react";
import { RunIcon } from "../features/actions/RunIcon";
import { runState } from "../features/actions/runState";
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
  // Stock Button variants have no warning/error fill, so the state shows as
  // a token-coloured label and icon only — no dot (see `runState`).
  running: { color: colorVars["--color-text-warning"] },
  failed: { color: colorVars["--color-text-error"] },
});

function pickCurrent(actions: ActionSummary[]): ActionSummary | null {
  return actions.find((a) => a.lastRun) ?? actions[0] ?? null;
}

// Top-bar shortcut for the Actions tab (`ActionsTab.tsx`): a split button
// showing the last-ran action (or the first one, if none has run yet) that
// starts/stops it on click, plus a dropdown for jumping to any other
// action without having to open the side panel.
export default function TopBarActions() {
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const { actions, checkoutPath } = useActions();

  const current = pickCurrent(actions);
  if (!current) return null;

  const rest = actions.filter((a) => a.id !== current.id);
  const state = runState(current);

  // Running: amber Stop + amber label. Failed: red Play + red label, exit
  // code in the tooltip. Idle/stopped/exited cleanly: plain Play.
  const currentTooltip = current.running
    ? `${current.name} is running — click to stop`
    : state.failed
      ? `${current.name} exited with code ${current.exitCode} — click to run again`
      : `Run ${current.name}`;

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
        size="sm"
        label={current.name}
        icon={<RunIcon action={current} />}
        // `clickAction` shows the stock spinner while the run/stop call is
        // in flight — the "starting" state, before `run://status` lands.
        clickAction={() => handleToggle(current)}
        tooltip={currentTooltip}
        xstyle={[
          styles.current,
          current.running && styles.running,
          !current.running && state.failed && styles.failed,
        ]}
      />
      {rest.length > 0 && (
        <DropdownMenu
          placement="below"
          alignment="end"
          menuWidth="14rem"
          renderTrigger={(triggerProps) => (
            <IconButton
              {...triggerProps}
              size="sm"
              label="Other actions"
              tooltip="Other actions"
              icon={<Icon icon={ChevronDown} size="sm" />}
            />
          )}
        >
          {rest.map((action) => (
            <DropdownMenuItem
              key={action.id}
              icon={<RunIcon action={action} />}
              label={action.name}
              onClick={() => void handleToggle(action)}
            />
          ))}
        </DropdownMenu>
      )}
    </ButtonGroup>
  );
}
