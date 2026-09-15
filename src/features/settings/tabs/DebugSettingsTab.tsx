import type { ReactNode } from "react";
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
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md bg-[#141518] px-3 py-2.5 shadow-[var(--al-shadow)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
      />
      <span>
        <span className="block text-sm text-zinc-200">{label}</span>
        <span className="block text-xs text-zinc-600">{hint}</span>
      </span>
    </label>
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
