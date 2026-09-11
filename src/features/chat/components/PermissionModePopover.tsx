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
          variant="unstyled"
          size="none"
          title="Tool-call permission mode"
          className={`flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs outline-none ${
            mode === "bypass"
              ? "shadow-[0_0_0_1px_rgba(120,53,15,0.5)] bg-amber-950/20 text-amber-400 hover:bg-amber-950/30"
              : "shadow-[var(--al-shadow)] bg-white/[0.04] text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          }`}
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
              variant="unstyled"
              size="none"
              onClick={() => {
                onSelect(o.key);
                onOpenChange(false);
              }}
              className={`block w-full whitespace-normal px-3 py-2 text-left ${
                o.key === mode ? "bg-white/10" : "hover:bg-white/5"
              }`}
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
