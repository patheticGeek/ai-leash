import { Button } from "@/ui/button";
import { type PanelTabKind, useAppStore } from "../../store";
import { PICKER_TAB_KINDS } from "./tabKinds";

export default function TabPicker({
  onPick,
}: {
  onPick: (kind: PanelTabKind) => void;
}) {
  // Scoped to the active conversation, same as `SubAgentsTab.tsx`/
  // `SidePanel.tsx`'s own badge — otherwise this would count another
  // conversation's still-running sub-agents too.
  const runningSubAgents = useAppStore(
    (s) =>
      s.subAgentTasks.filter(
        (t) =>
          t.status === "running" && t.parentSessionId === s.activeSessionId,
      ).length,
  );

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <div className="text-xs uppercase tracking-wide text-zinc-600">
        Open a tab
      </div>
      <div
        className="grid w-full gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
      >
        {PICKER_TAB_KINDS.map((tile) => (
          <Button
            key={tile.kind}
            variant="unstyled"
            size="none"
            onClick={() => onPick(tile.kind)}
            className="relative flex min-w-0 flex-col items-start gap-1.5 rounded-md bg-card px-3 py-2.5 text-left shadow-[var(--al-shadow)] hover:shadow-[0_0_0_1px_var(--primary)] hover:bg-white/5"
          >
            {tile.kind === "subagents" && runningSubAgents > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {runningSubAgents}
              </span>
            )}
            <div className="flex w-full items-center gap-2">
              {tile.icon && <tile.icon size={16} className="text-zinc-500" />}
              <span className="w-full text-sm text-zinc-200">{tile.label}</span>
            </div>
            <span className="whitespace-normal w-full text-[11px] text-zinc-600">
              {tile.hint}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
