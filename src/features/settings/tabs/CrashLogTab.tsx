import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import {
  colorVars,
  radiusVars,
  spacingVars,
  typographyVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import { api } from "../../../lib/tauriApi";
import { Hint, SectionHeading } from "./SettingsParts";

const styles = stylex.create({
  // The log itself: a sunken, scrolling, selectable monospace block that
  // keeps the log's own line breaks.
  log: {
    backgroundColor: colorVars["--color-background-body"],
    borderRadius: radiusVars["--radius-element"],
    padding: spacingVars["--spacing-3"],
    fontFamily: typographyVars["--font-family-code"],
    whiteSpace: "pre-wrap",
    userSelect: "text",
  },
});

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

  return (
    <VStack gap={3} height="100%">
      <HStack justify="between" vAlign="center" gap={2}>
        <SectionHeading>Crash log</SectionHeading>
        <HStack gap={2}>
          <Button
            variant="secondary"
            size="sm"
            label="Refresh"
            icon={<RefreshCw size={13} />}
            onClick={refresh}
          />
          <Button
            variant="secondary"
            size="sm"
            label={copied ? "Copied" : "Copy"}
            icon={copied ? <Check size={13} /> : <Copy size={13} />}
            onClick={() => log && copy(log)}
            isDisabled={!log}
          />
          <Button
            variant="destructive"
            size="sm"
            label="Clear"
            icon={<Trash2 size={13} />}
            onClick={clear}
            isDisabled={!log}
          />
        </HStack>
      </HStack>
      <Hint>
        Backend panics and frontend errors (uncaught exceptions, unhandled
        promise rejections, React crashes) are appended here as they happen —
        including ones from a previous run, so you can find out what happened
        after restarting the app.
      </Hint>
      <StackItem size="fill" isScrollable xstyle={styles.log}>
        <Text type="code" color="secondary">
          {log === null ? "Loading…" : log === "" ? "No crashes logged." : log}
        </Text>
      </StackItem>
    </VStack>
  );
}
