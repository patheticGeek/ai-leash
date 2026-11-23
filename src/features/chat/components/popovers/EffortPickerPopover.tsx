import { Button } from "@astryxdesign/core/Button";
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { Brain, Gauge, Sparkles, Zap } from "lucide-react";

interface EffortPickerPopoverProps {
  options: { value: string; name: string }[];
  value: string;
  onSelect: (value: string) => void;
}

export default function EffortPickerPopover({
  options,
  value,
  onSelect,
}: EffortPickerPopoverProps) {
  // Some ACP agents report the selected thought level as the sentinel
  // `"default"` even though their select options contain the concrete
  // levels. Treat the explicitly named Default option as the mapping; when
  // it is omitted, the first advertised option is the agent's default.
  const active =
    options.find((option) => option.value === value) ??
    (value === "default"
      ? (options.find((option) => option.name.toLowerCase() === "default") ??
        options[0])
      : undefined);
  const activeValue = active?.value;
  const effortText =
    `${active?.name ?? ""} ${active?.value ?? ""}`.toLowerCase();
  const EffortIcon = effortText.includes("high")
    ? Brain
    : effortText.includes("medium") || effortText.includes("balanced")
      ? Zap
      : effortText.includes("low") || effortText.includes("minimal")
        ? Gauge
        : effortText.includes("max") ||
            effortText.includes("ultra") ||
            effortText.includes("deep")
          ? Sparkles
          : Gauge;
  return (
    <DropdownMenu
      placement="above"
      alignment="start"
      menuWidth="14rem"
      renderTrigger={(triggerProps) => (
        <Button
          {...triggerProps}
          variant="secondary"
          size="sm"
          label={active?.name ?? "effort"}
          icon={<EffortIcon size={12} />}
          tooltip="Thinking effort"
          className="max-w-[120px]"
        />
      )}
    >
      <DropdownMenuRadioGroup
        label="Thinking effort"
        value={activeValue}
        onChange={onSelect}
      >
        {options.map((option) => (
          <DropdownMenuRadioItem
            key={option.value}
            value={option.value}
            label={option.name}
          />
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenu>
  );
}
