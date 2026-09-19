import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import type { PermissionMode } from "../../../store";

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

// Same look as `ModelPickerPopover` (border/bg/trigger/panel styling) — a
// second, simpler switcher next to it with just two fixed rows, so no
// search bar. Kept as its own component rather than a variant of
// `ModelPickerPopover` since there's no filtering/searching to share.
export default function PermissionModePopover({
  mode,
  onSelect,
  open,
  onOpenChange,
}: PermissionModePopoverProps) {
  const active = OPTIONS.find((o) => o.key === mode) ?? OPTIONS[0];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={mode === "bypass" ? "chip-warning" : "chip"}
          size="none"
          title="Tool-call permission mode"
          className="flex min-w-0 items-center gap-1"
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
        className="w-80 gap-0 overflow-hidden p-0"
      >
        <div className="py-1">
          {OPTIONS.map((o) => (
            <Button
              key={o.key}
              variant="menu-item"
              size="none"
              data-active={o.key === mode}
              className="whitespace-normal"
              onClick={() => {
                onSelect(o.key);
                onOpenChange(false);
              }}
            >
              <div className="text-sm font-medium text-zinc-100">{o.label}</div>
              <div className="text-xs text-zinc-500">{o.subtitle}</div>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
