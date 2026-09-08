import { Bot, FolderTree, SquareTerminal } from "lucide-react";
import type { PanelTabKind } from "../store";
import Button from "./Button";

const TILES: {
  kind: PanelTabKind;
  label: string;
  hint: string;
  icon: typeof Bot;
}[] = [
  {
    kind: "filetree",
    label: "File Tree",
    hint: "Browse project files",
    icon: FolderTree,
  },
  {
    kind: "terminal",
    label: "Terminal",
    hint: "Start a shell in this project",
    icon: SquareTerminal,
  },
  {
    kind: "subagents",
    label: "Sub Agents",
    hint: "Watch running sub-agent tasks",
    icon: Bot,
  },
];

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
      <div className="grid w-full max-w-xs grid-cols-2 gap-2">
        {TILES.map((tile) => (
          <Button
            key={tile.kind}
            variant="unstyled"
            size="none"
            onClick={() => onPick(tile.kind)}
            className="flex min-w-0 flex-col items-start gap-1.5 rounded border border-[#26272c] bg-[#141518] px-3 py-2.5 text-left hover:border-[#3a5f8f] hover:bg-white/5"
          >
            <div className="flex w-full items-center gap-2">
              <tile.icon size={16} className="text-zinc-500" />
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
