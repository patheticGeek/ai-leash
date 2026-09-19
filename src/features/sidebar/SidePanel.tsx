import { Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/ui/tabs";
import { type PanelTabKind, useAppStore } from "../../store";
import TabPicker from "./TabPicker";
import { PANEL_TAB_KINDS } from "./tabKinds";

export default function SidePanel() {
  const panelTabs = useAppStore((s) => s.panelTabs);
  const activePanelTabId = useAppStore((s) => s.activePanelTabId);
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const closePanelTab = useAppStore((s) => s.closePanelTab);
  const setActivePanelTab = useAppStore((s) => s.setActivePanelTab);
  const openFiles = useAppStore((s) => s.openFiles);
  // Scoped to the active conversation, same as `SubAgentsTab.tsx` itself —
  // otherwise this would count another conversation's still-running
  // sub-agents too, once more than one has ever been loaded into memory
  // this session.
  const runningSubAgents = useAppStore(
    (s) =>
      s.subAgentTasks.filter(
        (t) =>
          t.status === "running" && t.parentSessionId === s.activeSessionId,
      ).length,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeTab = panelTabs.find((t) => t.id === activePanelTabId) ?? null;
  const keepMountedTabs = panelTabs.filter(
    (t) => PANEL_TAB_KINDS[t.kind].mountMode === "keep-mounted-per-tab",
  );
  const showPicker = pickerOpen || panelTabs.length === 0;

  function pick(kind: PanelTabKind) {
    openPanelTab(kind);
    setPickerOpen(false);
  }

  return (
    <div className="flex h-full flex-col bg-sunken">
      <div className="flex shrink-0 items-center pr-1.5">
        <Tabs
          value={showPicker ? "" : (activePanelTabId ?? "")}
          onValueChange={(id) => {
            setActivePanelTab(id);
            setPickerOpen(false);
          }}
          className="min-w-0 flex-1 gap-0"
        >
          <TabsList variant="strip">
            {panelTabs.map((tab) => {
              const dirty =
                tab.kind === "file" &&
                !!openFiles.find((f) => f.path === tab.path)?.dirty;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  onClose={() => closePanelTab(tab.id)}
                  className="gap-1.5"
                >
                  <span className="max-w-[10rem] truncate">{tab.label}</span>
                  {tab.kind === "subagents" && runningSubAgents > 0 && (
                    <Badge size="count" className="h-4 min-w-4 px-1.5">
                      {runningSubAgents}
                    </Badge>
                  )}
                  {dirty && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
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
        {keepMountedTabs.map((tab) => (
          <div
            key={tab.id}
            className={
              tab.id === activePanelTabId && !showPicker ? "h-full" : "hidden"
            }
          >
            {PANEL_TAB_KINDS[tab.kind].render(tab)}
          </div>
        ))}
        {!showPicker &&
          activeTab &&
          PANEL_TAB_KINDS[activeTab.kind].mountMode === "active-only" &&
          PANEL_TAB_KINDS[activeTab.kind].render(activeTab)}
        {showPicker && <TabPicker onPick={pick} />}
      </div>
    </div>
  );
}
