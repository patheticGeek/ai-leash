import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { type PanelTabKind, useAppStore } from "../../store";
import { TabBody } from "../tabs/TabContent";
import { useTabDropArea } from "../tabs/TabDnd";
import TabStrip from "../tabs/TabStrip";
import TabPicker from "./TabPicker";

const styles = stylex.create({
  fill: { height: "100%" },
  header: { flexShrink: 0 },
  tabStrip: { flex: 1 },
  // Takes what the tab row leaves; the positioning context for tab content.
  body: { position: "relative", flex: 1, minHeight: 0 },
});

export default function SidePanel() {
  const panelTabs = useAppStore((s) => s.panelTabs);
  const activePanelTabId = useAppStore((s) => s.activePanelTabId);
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const activateTab = useAppStore((s) => s.activateTab);
  const dropRef = useTabDropArea("side");
  const [pickerOpen, setPickerOpen] = useState(false);

  const showPicker = pickerOpen || panelTabs.length === 0;

  // A tab activated from anywhere else (dropped in from the centre, a file
  // opened from the tree, an Action run) replaces the picker.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activePanelTabId is the trigger
  useEffect(() => {
    setPickerOpen(false);
  }, [activePanelTabId]);

  function pick(kind: PanelTabKind) {
    openPanelTab(kind);
    setPickerOpen(false);
  }

  return (
    <VStack ref={dropRef} xstyle={styles.fill}>
      <HStack align="center" paddingInlineEnd={1.5} xstyle={styles.header}>
        <TabStrip
          tabs={panelTabs}
          value={showPicker ? "" : (activePanelTabId ?? "")}
          onSelect={(id) => {
            activateTab(id);
            setPickerOpen(false);
          }}
          xstyle={styles.tabStrip}
        />
        <IconButton
          variant="ghost"
          size="sm"
          label="Open tab"
          tooltip="Open tab"
          icon={<Plus size={14} />}
          onClick={() => setPickerOpen(true)}
        />
      </HStack>
      <VStack xstyle={styles.body}>
        <TabBody
          tabs={panelTabs}
          activeId={activePanelTabId}
          hidden={showPicker}
        />
        {showPicker && <TabPicker onPick={pick} />}
      </VStack>
    </VStack>
  );
}
