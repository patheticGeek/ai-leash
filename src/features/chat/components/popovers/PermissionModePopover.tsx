import { Button } from "@astryxdesign/core/Button";
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { ShieldCheck, ShieldOff } from "lucide-react";

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

// A second, simpler switcher next to `ModelPickerPopover` — a short fixed
// list, so a radio menu rather than a searchable palette.
export default function PermissionModePopover({
  options,
  value,
  onSelect,
  warn,
  open,
  onOpenChange,
}: PermissionModePopoverProps) {
  const active = options.find((o) => o.value === value) ?? options[0];

  return (
    <DropdownMenu
      isMenuOpen={open}
      onOpenChange={onOpenChange}
      placement="above"
      alignment="start"
      menuWidth="20rem"
      renderTrigger={(triggerProps) => (
        <Button
          {...triggerProps}
          variant="ghost"
          size="sm"
          label={active?.label ?? value}
          icon={warn ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
          tooltip="Tool-call permission mode"
        />
      )}
    >
      <DropdownMenuRadioGroup
        label="Tool-call permission mode"
        value={value}
        onChange={onSelect}
      >
        {options.map((o) => (
          <DropdownMenuRadioItem
            key={o.value}
            value={o.value}
            label={o.label}
            description={o.subtitle ?? undefined}
          />
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenu>
  );
}
