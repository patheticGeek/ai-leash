import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { useSubAgents } from "@/data/subAgents";
import { type PanelTabKind, useAppStore } from "../../store";
import { PICKER_TAB_KINDS } from "../tabs/tabKinds";

const styles = stylex.create({
  fill: { height: "100%" },
  // Pinned over the tile's top-right corner.
  corner: {
    position: "absolute",
    top: `calc(-1 * ${spacingVars["--spacing-1-5"]})`,
    right: `calc(-1 * ${spacingVars["--spacing-1-5"]})`,
  },
  tile: { minWidth: 0, textAlign: "start" },
  heading: { textTransform: "uppercase", letterSpacing: "0.05em" },
});

export default function TabPicker({
  onPick,
}: {
  onPick: (kind: PanelTabKind) => void;
}) {
  // Scoped to the active conversation, same as `SubAgentsTab.tsx`/
  // `SidePanel.tsx`'s own badge — otherwise this would count another
  // conversation's still-running sub-agents too.
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const runningSubAgents = useSubAgents(activeSessionId).filter(
    (t) => t.status === "running",
  ).length;

  return (
    <Center padding={6} xstyle={styles.fill}>
      <VStack gap={4} hAlign="center" width="100%">
        <Text
          type="supporting"
          size="xsm"
          color="secondary"
          xstyle={styles.heading}
        >
          Open a tab
        </Text>
        <Grid columns={{ minWidth: 150, repeat: "fill" }} gap={2} width="100%">
          {PICKER_TAB_KINDS.map((tile) => (
            <ClickableCard
              key={tile.kind}
              label={tile.label ?? tile.kind}
              padding={3}
              onClick={() => onPick(tile.kind)}
              xstyle={styles.tile}
            >
              {tile.kind === "subagents" && runningSubAgents > 0 && (
                <Badge
                  variant="info"
                  label={runningSubAgents}
                  xstyle={styles.corner}
                />
              )}
              <VStack gap={1.5}>
                <HStack gap={2} align="center">
                  {tile.icon && (
                    <Icon icon={tile.icon} size="sm" color="secondary" />
                  )}
                  <Text type="label">{tile.label}</Text>
                </HStack>
                <Text type="supporting" size="xsm" color="secondary">
                  {tile.hint}
                </Text>
              </VStack>
            </ClickableCard>
          ))}
        </Grid>
      </VStack>
    </Center>
  );
}
