import { ShieldCheck, ShieldOff } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/ui/button";
import { Command, CommandItem, CommandList } from "@/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import type { PermissionMode } from "../../../../store";

interface PermissionModePopoverProps {
  mode: PermissionMode;
  onSelect: (mode: PermissionMode) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OPTIONS: { key: PermissionMode; label: string; subtitle: string }[] = [
  {
    key: "ask",
    label: "Ask",
    subtitle:
      "Prompt before edits, shell commands, and other tool calls that need approval",
  },
  {
    key: "bypass",
    label: "Bypass",
    subtitle:
      "Auto-approve every permission request for this conversation — no prompts",
  },
];

// Same look as `ModelPickerPopover` (a cmdk list in a popover) — a second,
// simpler switcher next to it with just two fixed rows, so no search bar. Kept as its own component rather than a variant of
// `ModelPickerPopover` since there's no filtering/searching to share.
export default function PermissionModePopover({
  mode,
  onSelect,
  open,
  onOpenChange,
}: PermissionModePopoverProps) {
  const active = OPTIONS.find((o) => o.key === mode) ?? OPTIONS[0];
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={mode === "bypass" ? "chip-warning" : "chip"}
          bordered={false}
          size="sm"
          title="Tool-call permission mode"
          className="flex min-w-0"
        >
          {mode === "bypass" ? (
            <ShieldOff size={12} />
          ) : (
            <ShieldCheck size={12} />
          )}
          {active.label}
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
        <Command ref={listRef} tabIndex={-1} defaultValue={mode}>
          <CommandList>
            {OPTIONS.map((o) => (
              <CommandItem
                key={o.key}
                value={o.key}
                data-checked={o.key === mode}
                checkIcon
                onSelect={() => {
                  onSelect(o.key);
                  onOpenChange(false);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-100">
                    {o.label}
                  </div>
                  <div className="text-xs text-zinc-500">{o.subtitle}</div>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
