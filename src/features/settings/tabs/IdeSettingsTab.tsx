import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { useAppStore } from "../../../store";
import { DEFAULT_IDE_COMMAND } from "../../../store/ideSlice";

export default function IdeSettingsTab() {
  const ideCommand = useAppStore((s) => s.ideCommand);
  const setIdeCommand = useAppStore((s) => s.setIdeCommand);

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        IDE
      </div>
      <div className="space-y-1.5 rounded-md bg-raised px-3 py-2.5">
        <Label htmlFor="ide-command" className="text-sm text-zinc-200">
          Command
        </Label>
        <Input
          id="ide-command"
          value={ideCommand}
          placeholder={DEFAULT_IDE_COMMAND}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setIdeCommand(e.target.value)}
        />
        <span className="block text-xs text-zinc-600">
          Launched by the title bar's Open button with the current project or
          worktree folder added as the last argument. Use any command on your
          PATH, with optional flags, such as{" "}
          <code className="font-mono text-zinc-400">code</code>,{" "}
          <code className="font-mono text-zinc-400">zed</code>,{" "}
          <code className="font-mono text-zinc-400">cursor</code> or{" "}
          <code className="font-mono text-zinc-400">code -n</code>.
        </span>
      </div>
    </div>
  );
}
