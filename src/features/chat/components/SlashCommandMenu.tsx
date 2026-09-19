import { Button } from "@/ui/button";
import type { AcpCommandInfo } from "../../../lib/tauriApi";

export interface SlashCommandMenuProps {
  matches: AcpCommandInfo[];
  activeIndex: number;
  onSelect: (command: AcpCommandInfo) => void;
}

// The "/" autocomplete dropdown anchored above the chat input. Purely
// presentational — which commands match what's typed, the highlighted
// index, and the dismissed-until-query-changes bookkeeping all live in
// `ChatPanel.tsx` (`slashQuery`/`slashMatches`/`slashDismissed`/
// `slashIndex`), since the same keydown handler that drives this popover's
// arrow-key/Tab/Escape navigation also has to fall through to "send the
// message" on a plain Enter — splitting that one handler across a
// component boundary risked subtly changing which key press wins.
export default function SlashCommandMenu({
  matches,
  activeIndex,
  onSelect,
}: SlashCommandMenuProps) {
  return (
    <div className="absolute bottom-full left-0 right-0 z-20 mx-5 mb-1 max-h-56 overflow-y-auto rounded-t-xl bg-popover py-1 text-popover-foreground shadow-[var(--al-shadow)] flex flex-col">
      {matches.map((c, i) => (
        <Button
          key={c.name}
          variant="menu-item"
          size="none"
          data-active={i === activeIndex}
          className="py-1.5"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(c);
          }}
        >
          <div className="text-sm font-medium text-zinc-100 flex">
            <span>/{c.name}</span>
            {c.hint && (
              <span className="text-zinc-500 truncate ml-2">{c.hint}</span>
            )}
          </div>
          <div className="text-xs text-zinc-500 whitespace-normal">
            {c.description}
          </div>
        </Button>
      ))}
    </div>
  );
}
