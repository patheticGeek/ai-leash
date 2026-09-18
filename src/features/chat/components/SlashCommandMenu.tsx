import type { RefObject } from "react";
import { Command, CommandItem, CommandList } from "@/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/ui/popover";
import type { AcpCommandInfo } from "../../../lib/tauriApi";

export interface SlashCommandMenuProps {
  matches: AcpCommandInfo[];
  activeIndex: number;
  onSelect: (command: AcpCommandInfo) => void;
  onActiveIndexChange: (index: number) => void;
  // The chat input box the list opens above (it's a popover, not part of it).
  anchorRef: RefObject<HTMLElement | null>;
}

// The "/" autocomplete list anchored above the chat input. Presentational —
// which commands match what's typed, the highlighted index, and the
// dismissed-until-query-changes bookkeeping all live in `ChatPanel.tsx`
// (`slashQuery`/`slashMatches`/`slashDismissed`/`slashIndex`), since the same
// keydown handler that drives this list's arrow-key/Tab/Escape navigation
// also has to fall through to "send the message" on a plain Enter — splitting
// that one handler across a component boundary risked subtly changing which
// key press wins. Focus therefore never leaves the textarea: the popover
// doesn't take it on open, and mouse-down inside it is swallowed.
export default function SlashCommandMenu({
  matches,
  activeIndex,
  onSelect,
  onActiveIndexChange,
  anchorRef,
}: SlashCommandMenuProps) {
  return (
    <Popover open>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        side="top"
        align="center"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-(--radix-popover-trigger-width) gap-0 p-0"
      >
        <Command
          shouldFilter={false}
          value={String(activeIndex)}
          onValueChange={(v) => onActiveIndexChange(Number(v))}
          onMouseDown={(e) => e.preventDefault()}
        >
          <CommandList className="max-h-56">
            {matches.map((c, i) => (
              <CommandItem
                key={c.name}
                value={String(i)}
                onSelect={() => onSelect(c)}
                className="flex-col items-start gap-0 py-1.5"
              >
                <div className="flex text-sm font-medium text-zinc-100">
                  <span>/{c.name}</span>
                  {c.hint && (
                    <span className="ml-2 truncate text-zinc-500">
                      {c.hint}
                    </span>
                  )}
                </div>
                <div className="whitespace-normal text-xs text-zinc-500">
                  {c.description}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
