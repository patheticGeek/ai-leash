import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import { type PanelTabKind, useAppStore } from "../../store";
import { TabBody } from "../tabs/TabContent";
import { useTabDropArea } from "../tabs/TabDnd";
import TabStrip from "../tabs/TabStrip";
import TabPicker from "./TabPicker";

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
    <div ref={dropRef} className="flex h-full flex-col bg-sunken">
      <div className="flex shrink-0 items-center pr-1.5">
        <TabStrip
          tabs={panelTabs}
          value={showPicker ? "" : (activePanelTabId ?? "")}
          onSelect={(id) => {
            activateTab(id);
            setPickerOpen(false);
          }}
          className="flex-1"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPickerOpen(true)}
          title="Open tab"
          className="shrink-0"
        >
          <Plus size={14} />
        </Button>
      </div>
      <div className="relative flex-1 min-h-0">
        <TabBody
          tabs={panelTabs}
          activeId={activePanelTabId}
          hidden={showPicker}
        />
        {showPicker && <TabPicker onPick={pick} />}
      </div>
    </div>
  );
}
