import { Plus, X } from "lucide-react";
import { useState } from "react";
import { type PanelTabKind, useAppStore } from "../store";
import ActionsTab from "./ActionsTab";
import ActionTerminalTab from "./ActionTerminalTab";
import Button from "./Button";
import FileEditorTab from "./FileEditorTab";
import FileTree from "./FileTree";
import SubAgentsTab from "./SubAgentsTab";
import TabPicker from "./TabPicker";
import TerminalPanel from "./TerminalPanel";

export default function SidePanel() {
  const panelTabs = useAppStore((s) => s.panelTabs);
  const activePanelTabId = useAppStore((s) => s.activePanelTabId);
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const closePanelTab = useAppStore((s) => s.closePanelTab);
  const setActivePanelTab = useAppStore((s) => s.setActivePanelTab);
  const openFiles = useAppStore((s) => s.openFiles);
  const runningSubAgents = useAppStore(
    (s) => s.subAgentTasks.filter((t) => t.status === "running").length,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeTab = panelTabs.find((t) => t.id === activePanelTabId) ?? null;
  const terminalTabs = panelTabs.filter((t) => t.kind === "terminal");
  const actionTabs = panelTabs.filter((t) => t.kind === "action");
  const filetreeTab = panelTabs.find((t) => t.kind === "filetree");
  const showPicker = pickerOpen || panelTabs.length === 0;

  function pick(kind: PanelTabKind) {
    openPanelTab(kind);
    setPickerOpen(false);
  }

  return (
    <div className="flex h-full flex-col bg-[#0b0c0e] shadow-[var(--al-shadow-l)]">
      <div className="flex h-9 shrink-0 items-center gap-1 px-1.5 overflow-x-auto">
        {panelTabs.map((tab) => {
          const dirty =
            tab.kind === "file" &&
            !!openFiles.find((f) => f.path === tab.path)?.dirty;
          const active = tab.id === activePanelTabId && !showPicker;
          return (
            <div
              key={tab.id}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs cursor-default transition-colors duration-150 ease-out ${
                active
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Button
                variant="unstyled"
                size="none"
                onClick={() => {
                  setActivePanelTab(tab.id);
                  setPickerOpen(false);
                }}
                className="flex items-center gap-1.5"
              >
                <span className="max-w-[10rem] truncate">{tab.label}</span>
                {tab.kind === "subagents" && runningSubAgents > 0 && (
                  <span className="rounded-full bg-[#3a5f8f] px-1.5 text-[10px] text-white">
                    {runningSubAgents}
                  </span>
                )}
                {dirty && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Close tab"
                onClick={() => closePanelTab(tab.id)}
                className="-my-1 -mr-2 text-zinc-600 hover:text-zinc-300"
              >
                <X size={12} />
              </Button>
            </div>
          );
        })}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPickerOpen(true)}
          title="Open tab"
          className="ml-auto shrink-0"
        >
          <Plus size={14} />
        </Button>
      </div>
      <div className="relative flex-1 min-h-0">
        {terminalTabs.map((tab) => (
          <div
            key={tab.id}
            className={
              tab.id === activePanelTabId && !showPicker ? "h-full" : "hidden"
            }
          >
            <TerminalPanel />
          </div>
        ))}
        {filetreeTab && (
          <div
            className={
              filetreeTab.id === activePanelTabId && !showPicker
                ? "h-full"
                : "hidden"
            }
          >
            <FileTree />
          </div>
        )}
        {!showPicker && activeTab?.kind === "subagents" && <SubAgentsTab />}
        {!showPicker && activeTab?.kind === "file" && <FileEditorTab />}
        {!showPicker && activeTab?.kind === "actions" && <ActionsTab />}
        {actionTabs.map((tab) => (
          <div
            key={tab.id}
            className={
              tab.id === activePanelTabId && !showPicker ? "h-full" : "hidden"
            }
          >
            {tab.path && <ActionTerminalTab actionId={tab.path} />}
          </div>
        ))}
        {showPicker && <TabPicker onPick={pick} />}
      </div>
    </div>
  );
}
