import { Clock, Send, Square, SquareTerminal } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import type {
  AcpCommandInfo,
  PermissionRequestPayload,
} from "../../../lib/tauriApi";
import PermissionPopover from "./PermissionPopover";
import SlashCommandMenu from "./SlashCommandMenu";

const INPUT_MIN_ROWS = 3;
const INPUT_MAX_ROWS = 6;

export interface ChatInputBarProps {
  input: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  shellMode: boolean;
  pendingPermission: PermissionRequestPayload | null;
  onRespondPermission: (approved: boolean) => void;
  showSlashPopover: boolean;
  slashMatches: AcpCommandInfo[];
  slashActiveIndex: number;
  onAcceptSlash: (cmd: AcpCommandInfo) => void;
  sending: boolean;
  onSend: () => void;
  onStop: () => void;
  // Only reachable while `sending` and the box has text — see
  // `ChatPanel.tsx`'s `queueMessage`. Sits alongside `onStop`, which stays
  // available throughout.
  onQueue: () => void;
  sendDisabled: boolean;
  // Model/agent + permission-mode pickers (and, for OpenAI-compatible
  // providers, the free-text model id input) — composed by `ChatPanel.tsx`
  // and slotted in here rather than imported directly, so this component
  // stays about the input box itself, not who's picked to answer it.
  toolbarLeft: ReactNode;
  // `ContextUsageRing`, when there's a usage figure to show at all.
  contextUsage?: ReactNode;
}

// The textarea + send/stop button + its anchored popovers (permission ask,
// slash-command autocomplete) — the bottom third of `ChatPanel.tsx`.
export default function ChatInputBar({
  input,
  onChange,
  onKeyDown,
  textareaRef,
  shellMode,
  pendingPermission,
  onRespondPermission,
  showSlashPopover,
  slashMatches,
  slashActiveIndex,
  onAcceptSlash,
  sending,
  onSend,
  onStop,
  onQueue,
  sendDisabled,
  toolbarLeft,
  contextUsage,
}: ChatInputBarProps) {
  const showQueue = sending && input.trim().length > 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: input is a trigger-only dep — recompute textarea height on every keystroke, its value isn't read in the body
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const minHeight = lineHeight * INPUT_MIN_ROWS + paddingY;
    const maxHeight = lineHeight * INPUT_MAX_ROWS + paddingY;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input]);

  return (
    <div className="px-3 py-4">
      <div
        className={cn(
          "relative flex flex-col rounded-xl bg-raised transition-shadow duration-150",
          shellMode
            ? "shadow-[0_0_0_1px_rgba(16,185,129,0.6),0_6px_18px_-6px_rgba(0,0,0,0.6)]"
            : "shadow-[var(--al-shadow),0_6px_18px_-6px_rgba(0,0,0,0.6)] focus-within:shadow-[0_0_0_1px_rgba(94,146,255,0.5),0_0_0_3px_rgba(59,130,246,0.1),0_6px_18px_-6px_rgba(0,0,0,0.6)]",
        )}
      >
        {pendingPermission ? (
          <PermissionPopover
            request={pendingPermission}
            onRespond={onRespondPermission}
          />
        ) : (
          showSlashPopover && (
            <SlashCommandMenu
              matches={slashMatches}
              activeIndex={slashActiveIndex}
              onSelect={onAcceptSlash}
            />
          )
        )}
        <div className="relative">
          {shellMode && (
            <SquareTerminal
              size={14}
              className="pointer-events-none absolute left-3.5 top-[15px] text-emerald-400"
            />
          )}
          <Textarea
            ref={textareaRef}
            defaultValue={input}
            onChange={(e) => onChange(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask the agent...  / commands  ! shell"
            rows={INPUT_MIN_ROWS}
            className={cn(
              "py-3 leading-relaxed",
              shellMode
                ? "pl-9 pr-3.5 font-mono text-emerald-200"
                : "px-3.5 text-zinc-200",
            )}
          />
        </div>
        <div className="flex items-center justify-between gap-1.5 px-2 pb-2">
          <div className="flex min-w-0 items-center gap-1.5">{toolbarLeft}</div>
          <div className="flex items-center gap-1.5">
            {contextUsage}
            {showQueue && (
              <Button
                variant="chip"
                size="none"
                onClick={onQueue}
                title="Send after the current turn finishes (Ctrl+Enter)"
                className="flex items-center gap-1.5"
              >
                <Clock size={12} />
                <span>Queue</span>
              </Button>
            )}
            <Button
              variant={sending ? "chip-danger" : "chip-primary"}
              size="none"
              onClick={sending ? onStop : onSend}
              disabled={!sending && sendDisabled}
              title={sending ? "Stop" : "Send"}
              className="flex items-center gap-1.5"
            >
              {sending ? (
                <Square size={12} fill="currentColor" />
              ) : (
                <Send size={14} />
              )}
              <span>{sending ? "Stop" : "Send"}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
