import { Code } from "@astryxdesign/core/Code";
import { HStack } from "@astryxdesign/core/HStack";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import {
  COMPOSER_MIN_ROWS,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_COMPOSER_MAX_ROWS,
  DEFAULT_IDE_COMMAND,
  DEFAULT_UI_FONT_SIZE,
  MAX_COMPOSER_MAX_ROWS,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  usePreference,
  useSetPreferences,
} from "../../../data/preferences";
import FontFamilyPicker from "./FontFamilyPicker";
import { Hint, SettingsRow, SettingsSection } from "./SettingsParts";
import ToggleRow from "./ToggleRow";

const styles = stylex.create({
  // A short number field under a full-width label: the label keeps the row's
  // width, only the box is narrow.
  numberBox: { width: "6rem" },
});

function FontRow({
  label,
  hint,
  monospace,
  family,
  familyPlaceholder,
  onFamilyChange,
  size,
  defaultSize,
  onSizeChange,
}: {
  label: string;
  hint: string;
  monospace: boolean;
  family: string;
  familyPlaceholder: string;
  onFamilyChange: (family: string) => void;
  size: number;
  defaultSize: number;
  onSizeChange: (size: number) => void;
}) {
  return (
    <SettingsRow>
      <Text display="block">{label}</Text>
      <HStack gap={4} vAlign="end">
        <StackItem size="fill">
          <VStack gap={1}>
            <Hint>Font family</Hint>
            <HStack gap={2} vAlign="center">
              <StackItem size="fill">
                <TextInput
                  label={`${label} font family`}
                  isLabelHidden
                  width="100%"
                  value={family}
                  placeholder={familyPlaceholder}
                  hasSpellCheck={false}
                  autoComplete="off"
                  onChange={onFamilyChange}
                />
              </StackItem>
              <FontFamilyPicker
                monospaceFirst={monospace}
                onPick={onFamilyChange}
              />
            </HStack>
          </VStack>
        </StackItem>
        <VStack gap={1}>
          <Hint>Size (px)</Hint>
          <NumberInput
            label={`${label} size in pixels`}
            isLabelHidden
            width="6rem"
            isIntegerOnly
            value={size}
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            onChange={onSizeChange}
          />
        </VStack>
      </HStack>
      <Hint>
        {hint} Family is a CSS font list, such as{" "}
        <Code size="inherit">Inter, sans-serif</Code> (empty for the default).
        Default size is {defaultSize}px.
      </Hint>
    </SettingsRow>
  );
}

export default function PreferencesSettingsTab() {
  const composeMode = usePreference("composeMode");
  const composerMaxRows = usePreference("composerMaxRows");
  const collapseFinishedTurns = usePreference("collapseFinishedTurns");
  const uiFontFamily = usePreference("uiFontFamily");
  const uiFontSize = usePreference("uiFontSize");
  const codeFontFamily = usePreference("codeFontFamily");
  const codeFontSize = usePreference("codeFontSize");
  const ideCommand = usePreference("ideCommand");
  const debugModeEnabled = usePreference("debugModeEnabled");
  const debugShowIds = usePreference("debugShowIds");
  const setPreferences = useSetPreferences();

  return (
    <VStack gap={8}>
      <SettingsSection title="Chat">
        <ToggleRow
          label="Compose mode"
          hint="Enter inserts a new line in the chat box, and Ctrl+Enter sends
            the message instead."
          checked={composeMode}
          onChange={(composeMode) => setPreferences({ composeMode })}
        />
        <ToggleRow
          label="Collapse finished turns"
          hint="Once the agent finishes, its thinking, tool calls and messages
            before the final reply fold into one expandable “Worked
            for” row."
          checked={collapseFinishedTurns}
          onChange={(collapseFinishedTurns) =>
            setPreferences({ collapseFinishedTurns })
          }
        />
        <SettingsRow>
          <NumberInput
            label="Max chat box height (lines)"
            width="100%"
            controlXstyle={styles.numberBox}
            isIntegerOnly
            value={composerMaxRows}
            min={COMPOSER_MIN_ROWS}
            max={MAX_COMPOSER_MAX_ROWS}
            onChange={(composerMaxRows) => setPreferences({ composerMaxRows })}
          />
          <Hint>
            The chat box grows with your text up to this many lines, then
            scrolls. Between {COMPOSER_MIN_ROWS} and {MAX_COMPOSER_MAX_ROWS},
            default {DEFAULT_COMPOSER_MAX_ROWS}.
          </Hint>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Fonts">
        <FontRow
          label="Interface text"
          hint="Used for all normal text; the size sets the body text size (14 by default)."
          monospace={false}
          family={uiFontFamily}
          familyPlaceholder="Instrument Sans"
          onFamilyChange={(uiFontFamily) => setPreferences({ uiFontFamily })}
          size={uiFontSize}
          defaultSize={DEFAULT_UI_FONT_SIZE}
          onSizeChange={(uiFontSize) => setPreferences({ uiFontSize })}
        />
        <FontRow
          label="Code text"
          hint="Used for code blocks, tool output, terminals and the file editor."
          monospace
          family={codeFontFamily}
          familyPlaceholder="JetBrains Mono"
          onFamilyChange={(codeFontFamily) =>
            setPreferences({ codeFontFamily })
          }
          size={codeFontSize}
          defaultSize={DEFAULT_CODE_FONT_SIZE}
          onSizeChange={(codeFontSize) => setPreferences({ codeFontSize })}
        />
      </SettingsSection>
      <SettingsSection title="IDE">
        <SettingsRow>
          <TextInput
            label="Command"
            value={ideCommand}
            placeholder={DEFAULT_IDE_COMMAND}
            hasSpellCheck={false}
            autoComplete="off"
            onChange={(ideCommand) => setPreferences({ ideCommand })}
          />
          <Hint>
            Launched by the title bar's Open button with the current project or
            worktree folder added as the last argument. Use any command on your
            PATH, with optional flags, such as <Code size="inherit">code</Code>,{" "}
            <Code size="inherit">zed</Code>, <Code size="inherit">cursor</Code>{" "}
            or <Code size="inherit">code -n</Code>.
          </Hint>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Debug">
        <ToggleRow
          label="Enable debug mode"
          hint="Adds a floating icon (bottom-right) that opens a live ACP Events
            panel — every request, response, notification, and error crossing
            every conversation's agent connection, app-wide. Nothing is
            persisted to disk; events are only kept in memory while this is on,
            and are dropped the moment it's turned off."
          checked={debugModeEnabled}
          onChange={(debugModeEnabled) => setPreferences({ debugModeEnabled })}
        />
        <ToggleRow
          label="Show IDs in title bar"
          hint="Shows the current project, conversation, and ACP session id in
            the title bar's center section, as `project / conversation /
            session`."
          checked={debugShowIds}
          onChange={(debugShowIds) => setPreferences({ debugShowIds })}
        />
      </SettingsSection>
    </VStack>
  );
}
