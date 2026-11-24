import { Button } from "@astryxdesign/core/Button";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { HStack } from "@astryxdesign/core/HStack";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { formatTokenCount } from "@/lib/format";

const styles = stylex.create({
  card: { width: "14rem" },
});

export interface ContextUsageProps {
  usedTokens: number;
  contextLength: number | null;
}

// "62% of context" in the composer's header context slot — how much of the
// active model's context window this conversation has used. Hover (or focus)
// for the exact numbers. Only rendered by `ChatComposer` when there's a
// usage figure at all, so there's no "nothing to show" state.
export default function ContextUsage({
  usedTokens,
  contextLength,
}: ContextUsageProps) {
  // A 0 context length is treated as unknown rather than dividing by zero.
  const usagePct = contextLength
    ? Math.min(100, (usedTokens / contextLength) * 100)
    : null;
  const summary =
    usagePct !== null
      ? `${Math.round(usagePct)}% of context`
      : `${formatTokenCount(usedTokens)} tokens used`;

  return (
    <HoverCard
      label="Context usage"
      placement="above"
      alignment="end"
      focusTrigger="always"
      delay={0}
      hideDelay={0}
      xstyle={styles.card}
      content={
        <VStack gap={2}>
          <Text weight="medium">Context usage</Text>
          <ProgressBar
            label="Context used"
            isLabelHidden
            value={usagePct ?? 0}
            variant={
              usagePct !== null && usagePct >= 90
                ? "error"
                : usagePct !== null && usagePct >= 75
                  ? "warning"
                  : "accent"
            }
          />
          <HStack justify="between">
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {formatTokenCount(usedTokens)} used
            </Text>
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {contextLength ? formatTokenCount(contextLength) : "?"} total
            </Text>
          </HStack>
        </VStack>
      }
    >
      <Button variant="ghost" size="sm" label={summary} />
    </HoverCard>
  );
}
