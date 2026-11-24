import { Selector } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import {
  FolderTree,
  Keyboard,
  ListCollapse,
  MoveVertical,
  SquareKanban,
} from "lucide-react";
import {
  COMPOSER_MIN_ROWS,
  DEFAULT_COMPOSER_MAX_ROWS,
  MAX_COMPOSER_MAX_ROWS,
  usePreference,
  useSetPreferences,
} from "../../../data/preferences";
import type { Preferences } from "../../../lib/tauriApi";
import { CONTROL_WIDTH, SettingsCard, SettingsRow } from "../SettingsCard";

const HEIGHT_OPTIONS = Array.from(
  { length: MAX_COMPOSER_MAX_ROWS - COMPOSER_MIN_ROWS + 1 },
  (_, i) => {
    const n = COMPOSER_MIN_ROWS + i;
    return {
      value: String(n),
      label: `${n} lines${n === DEFAULT_COMPOSER_MAX_ROWS ? " (default)" : ""}`,
    };
  },
);

// Same choices as the sidebar's filter menu (`app/LeftBar.tsx`).
const LAYOUT_OPTIONS = [
  { value: "project", label: "Grouped by project" },
  { value: "flat", label: "Flat list" },
];
const TASK_CHAT_OPTIONS = [
  { value: "all", label: "Mixed in" },
  { value: "top", label: "Grouped at the top" },
  { value: "hide", label: "Hidden" },
];

export default function ChatSettingsTab() {
  const composeMode = usePreference("composeMode");
  const composerMaxRows = usePreference("composerMaxRows");
  const collapseFinishedTurns = usePreference("collapseFinishedTurns");
  const sidebarLayout = usePreference("sidebarLayout");
  const sidebarTaskChats = usePreference("sidebarTaskChats");
  const setPreferences = useSetPreferences();

  return (
    <VStack gap={5}>
      <SettingsCard title="Message box">
        <SettingsRow
          title="Compose mode"
          icon={Keyboard}
          description="Enter adds a new line and Ctrl+Enter sends. Off: Enter sends, Shift+Enter adds a line."
          control={
            <Switch
              label="Compose mode"
              isLabelHidden
              value={composeMode}
              onChange={(composeMode) => setPreferences({ composeMode })}
            />
          }
        />
        <SettingsRow
          title="Max chat box height"
          icon={MoveVertical}
          description="Lines the message box grows to before it scrolls."
          control={
            <Selector
              label="Max chat box height"
              isLabelHidden
              size="sm"
              width={CONTROL_WIDTH}
              value={String(composerMaxRows)}
              onChange={(v) =>
                v && setPreferences({ composerMaxRows: Number(v) })
              }
              options={HEIGHT_OPTIONS}
            />
          }
        />
      </SettingsCard>
      <SettingsCard title="Transcript">
        <SettingsRow
          title="Collapse finished turns"
          icon={ListCollapse}
          description="Once the agent finishes, its thinking, tool calls and messages before the final reply fold into one expandable “Worked for” row."
          control={
            <Switch
              label="Collapse finished turns"
              isLabelHidden
              value={collapseFinishedTurns}
              onChange={(collapseFinishedTurns) =>
                setPreferences({ collapseFinishedTurns })
              }
            />
          }
        />
      </SettingsCard>
      <SettingsCard title="Sidebar">
        <SettingsRow
          title="Chats"
          icon={FolderTree}
          description="Group chats under their project, or list them all together, most recent first, with each project's board above them."
          control={
            <Selector
              label="Chats"
              isLabelHidden
              size="sm"
              width={CONTROL_WIDTH}
              value={sidebarLayout}
              onChange={(v) =>
                v &&
                setPreferences({
                  sidebarLayout: v as Preferences["sidebarLayout"],
                })
              }
              options={LAYOUT_OPTIONS}
            />
          }
        />
        <SettingsRow
          title="Task chats"
          icon={SquareKanban}
          description="Where chats started for a board task go: mixed in with the rest, first in the list (or in each project), or hidden."
          control={
            <Selector
              label="Task chats"
              isLabelHidden
              size="sm"
              width={CONTROL_WIDTH}
              value={sidebarTaskChats}
              onChange={(v) =>
                v &&
                setPreferences({
                  sidebarTaskChats: v as Preferences["sidebarTaskChats"],
                })
              }
              options={TASK_CHAT_OPTIONS}
            />
          }
        />
      </SettingsCard>
    </VStack>
  );
}
