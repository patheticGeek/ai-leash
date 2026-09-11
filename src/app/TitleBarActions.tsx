import { ChevronDown, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button";
import { useActions } from "../features/actions/useActions";
import { type ActionSummary, api } from "../lib/tauriApi";

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

async function toggle(action: ActionSummary) {
  if (action.running) {
    await api.stopAction(action.id);
  } else {
    await api.runAction(action.id);
  }
}

// Title-bar shortcut for the Actions tab (`ActionsTab.tsx`): a split button
// showing the last-ran action (or the first one, if none has run yet) that
// starts/stops it on click, plus a dropdown for jumping to any other
// action without having to open the side panel.
export default function TitleBarActions() {
  const { actions, refresh } = useActions();
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
    await toggle(action);
    refresh();
  }

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center">
      <div className="flex items-center rounded-md bg-white/[0.04] shadow-[var(--al-shadow)]">
        <Button
          variant="unstyled"
          size="none"
          onClick={() => handleToggle(current)}
          title={
            current.running ? `Stop ${current.name}` : `Run ${current.name}`
          }
          className={`flex min-w-0 max-w-[160px] items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
            current.running
              ? "text-amber-400 hover:bg-amber-950/20"
              : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          }`}
        >
          {current.running ? <Square size={11} /> : <Play size={11} />}
          <span className="truncate">{current.name}</span>
        </Button>
        {rest.length > 0 && (
          <Button
            variant="unstyled"
            size="none"
            onClick={() => setOpen((o) => !o)}
            title="Other actions"
            className="flex items-center rounded-r-md px-1 py-1 text-zinc-500 shadow-[inset_1px_0_0_rgba(255,255,255,0.06)] hover:bg-white/5 hover:text-zinc-200"
          >
            <ChevronDown size={12} />
          </Button>
        )}
      </div>
      {open && rest.length > 0 && (
        <div className="absolute top-full right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl bg-[#141518] shadow-2xl shadow-black/60 ring-1 ring-white/5">
          <div className="max-h-72 overflow-auto py-1">
            {rest.map((action) => (
              <Button
                key={action.id}
                variant="unstyled"
                size="none"
                onClick={() => {
                  handleToggle(action);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5"
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
