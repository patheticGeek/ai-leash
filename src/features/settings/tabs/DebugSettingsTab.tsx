import { type ReactNode, useId } from "react";
import { Checkbox } from "@/ui/checkbox";
import { Label } from "@/ui/label";
import { useAppStore } from "../../../store";

function ToggleRow({
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
      className="cursor-pointer items-start gap-3 rounded-md bg-card px-3 py-2.5 font-normal leading-normal shadow-[var(--al-shadow)]"
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

export default function DebugSettingsTab() {
  const debugModeEnabled = useAppStore((s) => s.debugModeEnabled);
  const setDebugModeEnabled = useAppStore((s) => s.setDebugModeEnabled);
  const debugShowIds = useAppStore((s) => s.debugShowIds);
  const setDebugShowIds = useAppStore((s) => s.setDebugShowIds);

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Debug
      </div>
      <ToggleRow
        label="Enable debug mode"
        hint="Adds a floating icon (bottom-right) that opens a live ACP Events
          panel — every request, response, notification, and error crossing
          every conversation's agent connection, app-wide. Nothing is
          persisted to disk; events are only kept in memory while this is on,
          and are dropped the moment it's turned off."
        checked={debugModeEnabled}
        onChange={setDebugModeEnabled}
      />
      <ToggleRow
        label="Show IDs in title bar"
        hint="Shows the current project, conversation, and ACP session id in
          the title bar's center section, as `project / conversation /
          session`."
        checked={debugShowIds}
        onChange={setDebugShowIds}
      />
    </div>
  );
}
