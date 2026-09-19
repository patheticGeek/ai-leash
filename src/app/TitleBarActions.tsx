import { ChevronDown, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
    <div ref={rootRef} className="relative flex shrink-0 items-center">
      <div className="flex items-center rounded-md bg-white/[0.04] shadow-[var(--al-shadow)]">
        <Button
          variant={current.running ? "chip-warning" : "unstyled"}
          size="sm"
          onClick={() => handleToggle(current)}
          title={
            current.running ? `Stop ${current.name}` : `Run ${current.name}`
          }
          className={cn(
            "flex min-w-0 max-w-[160px]",
            !current.running &&
              "rounded-md text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
          )}
        >
          {current.running ? <Square size={11} /> : <Play size={11} />}
          <span className="truncate">{current.name}</span>
        </Button>
        {rest.length > 0 && (
          <Button
            variant="ghost"
            size="none"
            onClick={() => setOpen((o) => !o)}
            title="Other actions"
            className="flex items-center rounded-r-md px-1 py-1 shadow-[inset_1px_0_0_rgba(255,255,255,0.06)]"
          >
            <ChevronDown size={12} />
          </Button>
        )}
      </div>
      {open && rest.length > 0 && (
        <div className="absolute top-full right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl bg-card shadow-2xl shadow-black/60 ring-1 ring-white/5">
          <div className="max-h-72 overflow-auto py-1">
            {rest.map((action) => (
              <Button
                key={action.id}
                variant="menu-item"
                size="none"
                onClick={() => {
                  handleToggle(action);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2"
              >
                {action.running ? (
                  <Square size={11} className="shrink-0 text-amber-400" />
                ) : (
                  <Play size={11} className="shrink-0 text-zinc-500" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                  {action.name}
                </span>
                {action.running && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-400">
                    running
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
