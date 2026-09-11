import { Send, Square, SquareTerminal } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import type {
  AcpCommandInfo,
  PermissionRequestPayload,
} from "../../../lib/tauriApi";
import Button from "../../../ui/Button";
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
  sendDisabled,
  toolbarLeft,
  contextUsage,
}: ChatInputBarProps) {
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
    <div className="px-2 py-3">
      <div
        className={`relative flex flex-col rounded-lg bg-[#17181c] transition-shadow duration-150 ${
          shellMode
            ? "shadow-[0_0_0_1px_rgba(16,185,129,0.6)]"
            : "shadow-[var(--al-shadow)] focus-within:shadow-[0_0_0_1px_#3a5f8f]"
        }`}
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
              className="pointer-events-none absolute left-3 top-[11px] text-emerald-400"
            />
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onChange(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask the agent...  / commands  ! shell"
            rows={INPUT_MIN_ROWS}
            className={`w-full resize-none bg-transparent pt-2 pb-1 text-sm placeholder:text-zinc-600 outline-none ${
              shellMode
                ? "pl-8 pr-3 font-mono text-emerald-200"
                : "px-3 text-zinc-200"
            }`}
          />
        </div>
        <div className="flex items-center justify-between gap-1.5 px-1.5 pb-1.5">
          <div className="flex min-w-0 items-center gap-1.5">{toolbarLeft}</div>
          <div className="flex items-center gap-1.5">
            {contextUsage}
            <Button
              variant="unstyled"
              size="icon"
              onClick={sending ? onStop : onSend}
              disabled={!sending && sendDisabled}
              title={sending ? "Stop" : "Send"}
              className={`text-white transition-all duration-150 ${
                sending
                  ? "bg-red-600/90 shadow-[0_1px_4px_rgba(220,38,38,0.45),0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-red-500 hover:shadow-[0_2px_9px_rgba(220,38,38,0.55),0_0_0_1px_rgba(255,255,255,0.1)]"
                  : "bg-[#3a5f8f] shadow-[0_1px_4px_rgba(58,95,143,0.5),0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-[#4a6f9f] hover:shadow-[0_2px_9px_rgba(58,95,143,0.6),0_0_0_1px_rgba(255,255,255,0.1)] disabled:hover:bg-[#3a5f8f] disabled:hover:shadow-[0_1px_4px_rgba(58,95,143,0.5),0_0_0_1px_rgba(255,255,255,0.08)]"
              }`}
            >
              {sending ? (
                <Square size={13} fill="currentColor" />
              ) : (
                <Send size={14} />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
