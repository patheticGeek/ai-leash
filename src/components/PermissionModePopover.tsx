import { ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect, useRef } from "react";
import type { PermissionMode } from "../store";
import Button from "./Button";

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const active = OPTIONS.find((o) => o.key === mode) ?? OPTIONS[0];

  return (
    <div ref={rootRef} className="relative min-w-0">
      <Button
        variant="unstyled"
        size="none"
        onClick={() => onOpenChange(!open)}
        title="Tool-call permission mode"
        className={`flex min-w-0 items-center gap-1 rounded border px-1.5 py-1 text-xs outline-none ${
          mode === "bypass"
            ? "border-amber-900/50 bg-amber-950/20 text-amber-400 hover:bg-amber-950/30"
            : "border-[#26272c] bg-[#17181c] text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
        }`}
      >
        {mode === "bypass" ? (
          <ShieldOff size={12} />
        ) : (
          <ShieldCheck size={12} />
        )}
        {active.label}
      </Button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-lg border border-[#26272c] bg-[#141518] shadow-2xl">
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
                <div className="text-sm font-medium text-zinc-100">
                  {o.label}
                </div>
                <div className="text-xs text-zinc-500">{o.subtitle}</div>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
