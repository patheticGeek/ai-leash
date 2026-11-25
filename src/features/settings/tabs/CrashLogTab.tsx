// The crash log: one row with Refresh / Copy / Clear, the log itself in a
// wrapped CodeBlock under it (or a compact empty state).
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Check, CircleAlert, Copy, RefreshCw, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import { api } from "../../../lib/tauriApi";
import { SettingsCard, SettingsRow } from "../SettingsCard";

export default function CrashLogTab() {
  const [log, setLog] = useState<string | null>(null);
  const { copy, copied } = useCopyToClipboard();

  useEffect(() => {
    api.getCrashLog().then(setLog);
  }, []);

  async function refresh() {
    setLog(await api.getCrashLog());
  }

  async function clear() {
    await api.clearCrashLog();
    setLog("");
  }

  let detail: ReactNode;
  if (log === null) {
    detail = (
      <Text type="supporting" color="secondary">
        Loading…
      </Text>
    );
  } else if (log === "") {
    detail = (
      <EmptyState
        isCompact
        icon={<Icon icon={Check} color="secondary" />}
        title="No crashes logged"
        description="Anything that goes wrong shows up here, including crashes from earlier runs."
      />
    );
  } else {
    detail = (
      <CodeBlock
        code={log}
        language="plaintext"
        width="100%"
        size="sm"
        maxHeight={480}
        hasCopyButton={false}
        hasLanguageLabel={false}
        isWrapped
      />
    );
  }

  return (
    <VStack gap={5}>
      <SettingsCard title="Crash log">
        <SettingsRow
          title="Recorded crashes"
          icon={CircleAlert}
          description="Backend panics and frontend errors (uncaught exceptions, unhandled promise rejections, React crashes), appended as they happen and kept across restarts."
          control={
            <HStack gap={1}>
              <IconButton
                variant="ghost"
                size="sm"
                label="Refresh"
                tooltip="Refresh"
                icon={<Icon icon={RefreshCw} size="sm" />}
                onClick={refresh}
              />
              <IconButton
                variant="ghost"
                size="sm"
                label={copied ? "Copied" : "Copy"}
                tooltip={copied ? "Copied" : "Copy"}
                icon={<Icon icon={copied ? Check : Copy} size="sm" />}
                onClick={() => log && copy(log)}
                isDisabled={!log}
              />
              <IconButton
                variant="ghost"
                size="sm"
                label="Clear"
                tooltip="Clear"
                icon={<Icon icon={Trash2} size="sm" />}
                onClick={clear}
                isDisabled={!log}
              />
            </HStack>
          }
          detail={detail}
        />
      </SettingsCard>
    </VStack>
  );
}
