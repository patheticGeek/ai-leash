import { ShieldCheck, ShieldOff } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/ui/button";
import { Command, CommandItem, CommandList } from "@/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";

export interface PermissionModeOption {
  value: string;
  label: string;
  subtitle: string | null;
}

// AI Leash's own modes — what the picker offers for a backend that doesn't
// advertise modes of its own.
export const ASK_BYPASS_OPTIONS: PermissionModeOption[] = [
  {
    value: "ask",
    label: "Ask",
    subtitle:
      "Prompt before edits, shell commands, and other tool calls that need approval",
  },
  {
    value: "bypass",
    label: "Bypass",
    subtitle:
      "Auto-approve every permission request for this conversation — no prompts",
  },
];

interface PermissionModePopoverProps {
  // Ask/Bypass, or an ACP agent's own modes (its "mode" config option).
  options: PermissionModeOption[];
  value: string;
  onSelect: (value: string) => void;
  // Shows the trigger in the warning style — AI Leash's own Bypass. An
  // agent's modes carry no such flag in ACP, so theirs never warn.
  warn: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Same look as `ModelPickerPopover` (a cmdk list in a popover) — a second,
// simpler switcher next to it with a short fixed list, so no search bar.
// Kept as its own component rather than a variant of `ModelPickerPopover`
// since there's no filtering/searching to share.
export default function PermissionModePopover({
  options,
  value,
  onSelect,
  warn,
  open,
  onOpenChange,
}: PermissionModePopoverProps) {
  const active = options.find((o) => o.value === value) ?? options[0];
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={warn ? "chip-warning" : "chip"}
          bordered={false}
          size="sm"
          title="Tool-call permission mode"
          className="flex min-w-0"
        >
          {warn ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
          {active?.label ?? value}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => {
          // No search box to take focus, so give it to the list itself —
          // that's what makes arrow keys/Enter work straight away.
          e.preventDefault();
          listRef.current?.focus();
        }}
        className="w-80 gap-0 overflow-hidden p-0"
      >
        <Command ref={listRef} tabIndex={-1} defaultValue={value}>
          <CommandList>
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.value}
                data-checked={o.value === value}
                checkIcon
                onSelect={() => {
                  onSelect(o.value);
                  onOpenChange(false);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-100">
                    {o.label}
                  </div>
                  {o.subtitle && (
                    <div className="text-xs text-zinc-500">{o.subtitle}</div>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
