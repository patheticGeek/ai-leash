import { type ReactNode, useId } from "react";
import { Checkbox } from "@/ui/checkbox";
import { Label } from "@/ui/label";

export default function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <Label
      htmlFor={id}
      className="cursor-pointer items-start gap-3 rounded-md bg-raised px-3 py-2.5 font-normal leading-normal"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        className="mt-0.5"
      />
      <span>
        <span className="block text-sm text-zinc-200">{label}</span>
        <span className="block text-xs text-zinc-600">{hint}</span>
      </span>
    </Label>
  );
}
