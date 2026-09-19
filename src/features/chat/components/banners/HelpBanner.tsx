import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import type { AcpCommandInfo } from "../../../../lib/tauriApi";
import { dockClassName } from "./DockedBanner";

type HelpBannerProps = {
  commands: AcpCommandInfo[];
  onClose: () => void;
};

export default function HelpBanner({ commands, onClose }: HelpBannerProps) {
  return (
    <div
      className={cn(
        dockClassName("top"),
        "flex max-h-[50vh] flex-col overflow-auto rounded-t-md bg-background shadow-[var(--al-shadow-floating)]",
      )}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Commands
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close">
          <X size={14} />
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        <div className="rounded-md bg-raised px-3 py-2">
          <div className="text-sm font-medium text-zinc-100">
            !<span className="text-zinc-500"> command</span>
          </div>
          <div className="text-xs text-zinc-500">
            Run a shell command directly — no permission prompt, result shown as
            a tool call. Start with a space (" !...") to send a literal message
            instead.
          </div>
        </div>
        {commands.map((command) => (
          <div key={command.name} className="rounded-md bg-raised px-3 py-2">
            <div className="text-sm font-medium text-zinc-100">
              /{command.name}
              {command.hint && (
                <span className="text-zinc-500"> {command.hint}</span>
              )}
            </div>
            <div className="text-xs text-zinc-500">{command.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
