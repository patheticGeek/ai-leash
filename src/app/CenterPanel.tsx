import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { FolderOpen } from "lucide-react";
import { useIsBoardView } from "../features/board/useIsBoardView";
import { TabBody } from "../features/tabs/TabContent";
import { useTabDropArea } from "../features/tabs/TabDnd";
import TabStrip from "../features/tabs/TabStrip";
import { useAppStore } from "../store";
import { PRIMARY_TAB_ID } from "../store/panelSlice";
import { pickAndAddProject } from "./projectActions";

const styles = stylex.create({
  fill: { height: "100%" },
  // The tab body: takes what the tab strip leaves, and is the positioning
  // context for tab content that overlays it.
  body: { position: "relative", flex: 1, minHeight: 0 },
  tabStrip: { flexShrink: 0 },
  // The folder glyph's tile above the welcome heading.
  iconTile: {
    width: spacingVars["--spacing-12"],
    height: spacingVars["--spacing-12"],
    marginBlockEnd: spacingVars["--spacing-2"],
    borderRadius: radiusVars["--radius-container"],
    backgroundColor: colorVars["--color-background-muted"],
    boxShadow: `inset 0 0 0 ${borderVars["--border-width"]} ${colorVars["--color-accent-muted"]}`,
  },
  eyebrow: { textTransform: "uppercase", letterSpacing: "0.18em" },
});

function NoProjectState() {
  return (
    <Center padding={6} xstyle={styles.fill}>
      <VStack gap={3} hAlign="center" maxWidth={512}>
        <Center xstyle={styles.iconTile}>
          <Icon icon={FolderOpen} size="lg" color="accent" />
        </Center>
        <Text
          type="supporting"
          size="xsm"
          weight="medium"
          color="accent"
          xstyle={styles.eyebrow}
        >
          Welcome to ai-leash
        </Text>
        <Heading level={1} justify="center">
          Start with a project
        </Heading>
        <Text color="secondary" justify="center">
          Open a local folder to give your agent context, tools, and a
          conversation that stays with the project.
        </Text>
        <VStack paddingBlock={3}>
          <Button
            variant="primary"
            label="Open a project folder"
            icon={<FolderOpen size={15} />}
            onClick={() => void pickAndAddProject()}
          />
        </VStack>
        <Text type="supporting" size="xsm" color="secondary">
          You can also use Add project at the top of the sidebar.
        </Text>
      </VStack>
    </Center>
  );
}

export default function CenterPanel() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const hasDraft = useAppStore((s) => s.draft !== null);
  const chatTabs = useAppStore((s) => s.chatTabs);
  const activeChatTabId = useAppStore((s) => s.activeChatTabId);
  const activateTab = useAppStore((s) => s.activateTab);
  const dropRef = useTabDropArea("center");
  // The board is one view, not a set of tabs: only its primary tab shows.
  const boardView = useIsBoardView();

  if (!projectRoot || (!activeSessionId && !hasDraft)) {
    return <NoProjectState />;
  }

  return (
    <VStack ref={dropRef} xstyle={styles.fill}>
      {!boardView && (
        <TabStrip
          label="Chat tabs"
          tabs={chatTabs}
          value={activeChatTabId}
          onSelect={activateTab}
          xstyle={styles.tabStrip}
        />
      )}
      <VStack xstyle={styles.body}>
        <TabBody
          tabs={chatTabs}
          activeId={boardView ? PRIMARY_TAB_ID : activeChatTabId}
        />
      </VStack>
    </VStack>
  );
}
