import { VStack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Bug, Fingerprint } from "lucide-react";
import { usePreference, useSetPreferences } from "../../../data/preferences";
import { SettingsCard, SettingsRow } from "../SettingsCard";

export default function DebugSettingsTab() {
  const debugModeEnabled = usePreference("debugModeEnabled");
  const debugShowIds = usePreference("debugShowIds");
  const setPreferences = useSetPreferences();

  return (
    <VStack gap={5}>
      <SettingsCard title="Debug mode">
        <SettingsRow
          title="Debug mode"
          icon={Bug}
          description="Adds a bug button to the title bar that opens the live ACP Events panel: every request, response, notification and error on every conversation's agent connection. Events are kept in memory only while this is on."
          control={
            <Switch
              label="Debug mode"
              isLabelHidden
              value={debugModeEnabled}
              onChange={(debugModeEnabled) =>
                setPreferences({ debugModeEnabled })
              }
            />
          }
        />
        <SettingsRow
          title="Show IDs in the title bar"
          icon={Fingerprint}
          description="The current project, conversation and ACP session ids, as project / conversation / session, for bug reports."
          control={
            <Switch
              label="Show IDs in the title bar"
              isLabelHidden
              value={debugShowIds}
              onChange={(debugShowIds) => setPreferences({ debugShowIds })}
            />
          }
        />
      </SettingsCard>
    </VStack>
  );
}
