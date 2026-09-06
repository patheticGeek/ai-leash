import type { PanelTabKind } from "../store";

const TILES: { kind: PanelTabKind; label: string; hint: string }[] = [
  { kind: "filetree", label: "File Tree", hint: "Browse project files" },
  { kind: "terminal", label: "Terminal", hint: "Start a shell in this project" },
  { kind: "subagents", label: "Sub Agents", hint: "Watch running sub-agent tasks" },
];

export default function TabPicker({ onPick }: { onPick: (kind: PanelTabKind) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <div className="text-xs uppercase tracking-wide text-zinc-600">Open a tab</div>
      <div className="grid grid-cols-2 gap-2">
        {TILES.map((tile) => (
          <button
            key={tile.kind}
            onClick={() => onPick(tile.kind)}
            className="flex w-36 flex-col items-start gap-1 rounded border border-[#26272c] bg-[#141518] px-3 py-2.5 text-left hover:border-[#3a5f8f]"
          >
            <span className="text-sm text-zinc-200">{tile.label}</span>
            <span className="text-[11px] text-zinc-600">{tile.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
