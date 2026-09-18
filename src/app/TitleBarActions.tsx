import { ChevronDown, Play, Square } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Command, CommandItem, CommandList } from "@/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { useActions } from "../features/actions/useActions";
import { type ActionSummary, api } from "../lib/tauriApi";
import { useAppStore } from "../store";

// Whichever action was started most recently (even if it has since
// stopped) is treated as "current" and shown on the collapsed button;
// falls back to the first action defined when none has ever been run.
function pickCurrent(actions: ActionSummary[]): ActionSummary | null {
  if (actions.length === 0) return null;
  const withStart = actions.filter((a) => a.startedAt !== null);
  if (withStart.length === 0) return actions[0];
  return withStart.reduce((latest, a) =>
    (a.startedAt as number) > (latest.startedAt as number) ? a : latest,
  );
}

// Title-bar shortcut for the Actions tab (`ActionsTab.tsx`): a split button
// showing the last-ran action (or the first one, if none has run yet) that
// starts/stops it on click, plus a dropdown for jumping to any other
// action without having to open the side panel.
export default function TitleBarActions() {
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const { actions, refresh, checkoutPath } = useActions();
  const [open, setOpen] = useState(false);

  const current = pickCurrent(actions);
  if (!current) return null;

  const rest = actions.filter((a) => a.id !== current.id);

  async function handleToggle(action: ActionSummary) {
    if (!checkoutPath) return;
    if (action.running) {
      await api.stopAction(checkoutPath, action.id);
    } else {
      await api.runAction(checkoutPath, action.id);
      openPanelTab("action", { path: action.id, label: action.name });
    }
    refresh();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex shrink-0 items-center gap-px">
        <Button
          variant={current.running ? "chip-warning" : "chip"}
          bordered={false}
          size="sm"
          onClick={() => handleToggle(current)}
          title={
            current.running ? `Stop ${current.name}` : `Run ${current.name}`
          }
          className={cn(
            "flex min-w-0 max-w-[160px]",
            rest.length > 0 && "rounded-r-none",
          )}
        >
          {current.running ? <Square size={11} /> : <Play size={11} />}
          <span className="truncate">{current.name}</span>
        </Button>
        {rest.length > 0 && (
          <PopoverTrigger asChild>
            <Button
              variant="chip"
              size="sm"
              title="Other actions"
              className="rounded-l-none px-1.5"
            >
              <ChevronDown size={12} />
            </Button>
          </PopoverTrigger>
        )}
      </div>
      <PopoverContent align="end" className="w-56 gap-0 p-0">
        <Command>
          <CommandList>
            {rest.map((action) => (
              <CommandItem
                key={action.id}
                value={action.id}
                onSelect={() => {
                  handleToggle(action);
                  setOpen(false);
                }}
              >
                {action.running ? (
                  <Square size={11} className="shrink-0 text-warning" />
                ) : (
                  <Play size={11} className="shrink-0 text-zinc-500" />
                )}
                <span className="min-w-0 flex-1 truncate">{action.name}</span>
                {action.running && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-warning">
                    running
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
