import { Button } from "@/ui/button";
import type { PanelTabKind } from "../../store";
import { PICKER_TAB_KINDS } from "./tabKinds";

export default function TabPicker({
  onPick,
}: {
  onPick: (kind: PanelTabKind) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <div className="text-xs uppercase tracking-wide text-zinc-600">
        Open a tab
      </div>
      <div
        className="grid w-full gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
      >
        {PICKER_TAB_KINDS.map((tile) => (
          <Button
            key={tile.kind}
            variant="unstyled"
            size="none"
            onClick={() => onPick(tile.kind)}
            className="flex min-w-0 flex-col items-start gap-1.5 rounded-md bg-[#141518] px-3 py-2.5 text-left shadow-[var(--al-shadow)] hover:shadow-[0_0_0_1px_#3a5f8f] hover:bg-white/5"
          >
            <div className="flex w-full items-center gap-2">
              {tile.icon && <tile.icon size={16} className="text-zinc-500" />}
              <span className="w-full text-sm text-zinc-200">{tile.label}</span>
            </div>
            <span className="whitespace-normal w-full text-[11px] text-zinc-600">
              {tile.hint}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
