import type { PermissionRequestPayload } from "../lib/tauriApi";

interface PermissionPopoverProps {
  request: PermissionRequestPayload;
  onRespond: (approved: boolean) => void;
}

// The permission ask, rendered as a box popover anchored above the chat
// input — same visual language as `ModelPickerPopover`/the slash-command
// popover, rather than the full-screen dimmed modal this replaced (see
// `docs/features/agent-chat.md`). Always open when there's a request for
// this session (no internal open/close state of its own); `ChatPanel.tsx`
// decides *whether* to render it via `permissionForSession`.
export default function PermissionPopover({ request, onRespond }: PermissionPopoverProps) {
  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 flex max-h-[60vh] w-[480px] flex-col overflow-hidden rounded-lg border border-[#26272c] bg-[#141518] shadow-2xl">
      <div className="border-b border-[#26272c] px-3 py-2.5">
        <div className="text-sm font-medium text-zinc-100">{request.title}</div>
        <div className="mt-0.5 text-xs text-zinc-500">
          {request.kind === "shell"
            ? "The agent wants to run a shell command"
            : request.kind === "edit"
              ? "The agent wants to edit this file"
              : "The external ACP agent wants permission to proceed"}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs">
        {request.kind === "edit" ? (
          request.detail.split("\n").map((line, i) => (
            <div
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
          <pre className="whitespace-pre-wrap text-zinc-300">{request.detail}</pre>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[#26272c] px-3 py-2.5">
        <button
          onClick={() => onRespond(false)}
          className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
        >
          Deny
        </button>
        <button
          onClick={() => onRespond(true)}
          className="rounded bg-[#3a5f8f] px-3 py-1.5 text-sm text-white hover:bg-[#4a6f9f]"
        >
          Approve
        </button>
      </div>
    </div>
  );
}
