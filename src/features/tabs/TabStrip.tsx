import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import { useSubAgents } from "@/data/subAgents";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/ui/tabs";
import { useGenerating } from "../../lib/generatingQuery";
import { useAppStore, type WorkspaceTab } from "../../store";
import { SortableTab } from "./TabDnd";

// The tab row of either area — every tab kind can sit in either one, so
// each tab's decorations (running shine, sub-agent count, unsaved marker)
// follow its kind, not the strip it's in.
export default function TabStrip({
  tabs,
  value,
  onSelect,
  className,
}: {
  tabs: WorkspaceTab[];
  /** The selected tab id ("" for none). */
  value: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const closeTab = useAppStore((s) => s.closeTab);
  const openFiles = useAppStore((s) => s.openFiles);
  // Scoped to the active conversation — otherwise this would count another
  // conversation's still-running sub-agents too, once more than one has
  // ever been loaded into memory this session.
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  // Backend-driven per-session activity — the primary tab is covered by the
  // always-mounted `useGeneratingListener` (`App.tsx`), `useSubAgents`
  // covers sub-agent tabs (no `generating` event of its own; `status` is
  // already tracked for the Sub Agents tab).
  const primaryGenerating = useGenerating(activeSessionId ?? "").active;
  const subAgentTasks = useSubAgents(activeSessionId);
  const runningSubAgents = subAgentTasks.filter(
    (t) => t.status === "running",
  ).length;

  return (
    <Tabs
      value={value}
      onValueChange={onSelect}
      className={cn("min-w-0 gap-0", className)}
    >
      <TabsList variant="strip">
        <SortableContext
          items={tabs.map((t) => t.id)}
          strategy={horizontalListSortingStrategy}
        >
          {tabs.map((tab) => {
            const running =
              tab.kind === "primary"
                ? primaryGenerating
                : tab.kind === "subagent" &&
                  subAgentTasks.find((t) => t.subSessionId === tab.subSessionId)
                    ?.status === "running";
            // Only shine while this tab isn't the one you're already looking
            // at — the active tab's own content already shows its running
            // state (the "Working for…"/"Waiting" indicator).
            const shine = running && tab.id !== value;
            const dirty =
              tab.kind === "file" &&
              !!openFiles.find((f) => f.path === tab.path)?.dirty;
            return (
              <SortableTab key={tab.id} id={tab.id}>
                <TabsTrigger
                  value={tab.id}
                  onClose={
                    tab.kind === "primary" ? undefined : () => closeTab(tab.id)
                  }
                  className="gap-1.5"
                >
                  <span
                    className={cn(
                      "max-w-[12rem] truncate",
                      shine && "shine-text",
                    )}
                  >
                    {tab.label}
                  </span>
                  {tab.kind === "subagents" && runningSubAgents > 0 && (
                    <Badge size="count" className="h-4 min-w-4 px-1.5">
                      {runningSubAgents}
                    </Badge>
                  )}
                  {dirty && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                  )}
                </TabsTrigger>
              </SortableTab>
            );
          })}
        </SortableContext>
      </TabsList>
    </Tabs>
  );
}
