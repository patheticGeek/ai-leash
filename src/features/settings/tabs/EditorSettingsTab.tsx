import { Code } from "@astryxdesign/core/Code";
import { VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { SquareCode } from "lucide-react";
import {
  DEFAULT_IDE_COMMAND,
  usePreference,
  useSetPreferences,
} from "../../../data/preferences";
import { CONTROL_WIDTH, SettingsCard, SettingsRow } from "../SettingsCard";

export default function EditorSettingsTab() {
  const ideCommand = usePreference("ideCommand");
  const setPreferences = useSetPreferences();

  return (
    <VStack gap={5}>
      <SettingsCard title="Open in external editor">
        <SettingsRow
          title="Command"
          icon={SquareCode}
          description={
            <>
              Any launcher on your PATH, with optional flags, such as{" "}
              <Code size="inherit">zed</Code>,{" "}
              <Code size="inherit">cursor</Code> or{" "}
              <Code size="inherit">code -n</Code>. The project or worktree
              folder is added as the last argument.
            </>
          }
          control={
            <TextInput
              label="Editor command"
              isLabelHidden
              size="sm"
              width={CONTROL_WIDTH}
              value={ideCommand}
              placeholder={DEFAULT_IDE_COMMAND}
              hasSpellCheck={false}
              autoComplete="off"
              onChange={(ideCommand) => setPreferences({ ideCommand })}
            />
          }
        />
      </SettingsCard>
    </VStack>
  );
}
