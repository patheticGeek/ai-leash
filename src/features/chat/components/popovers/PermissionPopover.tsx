import { Check, FilePenLine, ShieldAlert, Terminal, X } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/ui/popover";
import type { PermissionRequestPayload } from "../../../../lib/tauriApi";

interface PermissionPopoverProps {
  request: PermissionRequestPayload;
  onRespond: (approved: boolean) => void;
  // The chat input box the ask opens above (it's a popover, not part of it).
  anchorRef: RefObject<HTMLElement | null>;
}

const KIND_ICON = {
  shell: Terminal,
  edit: FilePenLine,
  acp: ShieldAlert,
} as const;

const KIND_LABEL: Record<PermissionRequestPayload["kind"], string> = {
  shell: "The agent wants to run a shell command",
  edit: "The agent wants to edit this file",
  acp: "The external ACP agent wants permission to proceed",
};

// The permission ask, rendered as a box popover anchored above the chat
// input — same visual language as `ModelPickerPopover`/the slash-command
// popover, rather than the full-screen dimmed modal this replaced (see
// `docs/features/agent-chat.md`). Always open when there's a request for
// this session (no internal open/close state of its own); `ChatPanel.tsx`
// decides *whether* to render it via `permissionForSession`.
export default function PermissionPopover({
  request,
  onRespond,
  anchorRef,
}: PermissionPopoverProps) {
  const KindIcon = KIND_ICON[request.kind];
  return (
    <Popover open>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        side="top"
        align="center"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[40vh] w-(--radix-popover-trigger-width) gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <span
            title={KIND_LABEL[request.kind]}
            className="shrink-0 text-zinc-400"
          >
            <KindIcon size={16} />
          </span>
          <div className="truncate text-sm font-medium text-zinc-100">
            {request.title}
          </div>
        </div>
        <div className="flex-1 select-text overflow-auto px-3 py-2 font-mono text-xs">
          {request.kind === "edit" ? (
            request.detail.split("\n").map((line, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed diff text split into lines, no stable id available
                key={i}
                className={
                  line.startsWith("+ ")
                    ? "text-emerald-400"
                    : line.startsWith("- ")
                      ? "text-red-400"
                      : "text-zinc-500"
                }
              >
                {line || " "}
              </div>
            ))
          ) : (
            <pre className="whitespace-pre-wrap text-zinc-300">
              {request.detail}
            </pre>
          )}
        </div>
        <div className="flex items-center justify-end gap-1.5 px-3 py-2">
          <Button variant="ghost" size="sm" onClick={() => onRespond(false)}>
            <X size={13} />
            Deny
          </Button>
          <Button variant="primary" size="sm" onClick={() => onRespond(true)}>
            <Check size={13} />
            Approve
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
