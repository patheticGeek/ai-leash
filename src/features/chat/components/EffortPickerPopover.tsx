import { Brain, Gauge, Sparkles, Zap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";

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
  const [open, setOpen] = useState(false);
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="unstyled"
          size="none"
          title="Thinking effort"
          className="flex min-w-0 max-w-[120px] items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-1 text-xs text-zinc-400 outline-none shadow-[var(--al-shadow)] hover:bg-white/5 hover:text-zinc-200"
        >
          <EffortIcon size={12} className="shrink-0" />
          <span className="truncate">{active?.name ?? "effort"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-56 gap-0 overflow-hidden p-0"
      >
        <div className="py-1">
          {options.map((option) => (
            <Button
              key={option.value}
              variant="unstyled"
              size="none"
              onClick={() => {
                onSelect(option.value);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left ${
                option.value === activeValue
                  ? "bg-white/10"
                  : "hover:bg-white/5"
              }`}
            >
              <div className="text-sm font-medium text-zinc-100">
                {option.name}
              </div>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
