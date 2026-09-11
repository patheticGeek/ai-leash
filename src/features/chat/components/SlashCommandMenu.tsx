import type { AcpCommandInfo } from "../../../lib/tauriApi";
import Button from "../../../ui/Button";

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
    <div className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-80 overflow-auto rounded-xl bg-[#141518] py-1 shadow-2xl shadow-black/60 ring-1 ring-white/5">
      {matches.map((c, i) => (
        <Button
          key={c.name}
          variant="unstyled"
          size="none"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(c);
          }}
          className={`block w-full px-3 py-1.5 text-left ${
            i === activeIndex ? "bg-white/10" : "hover:bg-white/5"
          }`}
        >
          <div className="text-sm font-medium text-zinc-100">
            /{c.name}
            {c.hint && <span className="text-zinc-500"> {c.hint}</span>}
          </div>
          <div className="text-xs text-zinc-500">{c.description}</div>
        </Button>
      ))}
    </div>
  );
}
