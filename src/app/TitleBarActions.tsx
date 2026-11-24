import { Button } from "@astryxdesign/core/Button";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, Play, Square } from "lucide-react";
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
  // a StatusDot plus a token-coloured label and icon (see `runState`).
  running: { color: colorVars["--color-text-warning"] },
  failed: { color: colorVars["--color-text-error"] },
});

// Same dot and colours as the Actions tab's rows; nothing for an idle one.
function DropdownRunDot({ action }: { action: ActionSummary }) {
  const { tone, label } = runState(action);
  if (tone === "neutral") return null;
  return (
    <StatusDot
      variant={tone}
      isPulsing={action.running}
      label={label}
      tooltip={label}
    />
  );
}

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
  const state = runState(current);

  // Running: pulsing warning dot + warning label + a Stop glyph at the end.
  // Failed: Play tinted in the error colour, exit code in the tooltip.
  // Idle/stopped/exited cleanly: plain Play, as before.
  const currentIcon = current.running ? (
    <StatusDot variant="warning" isPulsing label="Running" />
  ) : (
    <Icon icon={Play} size="sm" color={state.failed ? "error" : "inherit"} />
  );
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
        icon={currentIcon}
        endContent={
          current.running ? (
            <Icon icon={Square} size="sm" color="warning" />
          ) : undefined
        }
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
              icon={<Icon icon={action.running ? Square : Play} size="sm" />}
              label={action.name}
              endContent={<DropdownRunDot action={action} />}
              onClick={() => void handleToggle(action)}
            />
          ))}
        </DropdownMenu>
      )}
    </ButtonGroup>
  );
}
