import { Clock, Send, Square, SquareTerminal } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { COMPOSER_MIN_ROWS } from "@/store/preferencesSlice";
import { AutoResizeTextarea } from "@/ui/AutoResizeTextarea";
import { Button } from "@/ui/button";
import type {
  AcpCommandInfo,
  ElicitationAnswer,
  ElicitationRequestPayload,
  PermissionRequestPayload,
} from "../../../../lib/tauriApi";
import ElicitationPopover from "../popovers/ElicitationPopover";
import PermissionPopover from "../popovers/PermissionPopover";
import SlashCommandMenu from "../popovers/SlashCommandMenu";

const getPlaceholderText = (composeMode: boolean) => {
  let text = "Ask the agent...  / commands  ! shell";

  if (composeMode) {
    text += "\nctrl + ↵  to send";
  } else {
    text += "\n↵  to send";
  }

  return text;
};

export interface ChatInputBarProps {
  input: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  shellMode: boolean;
  pendingPermission: PermissionRequestPayload | null;
  onRespondPermission: (approved: boolean) => void;
  pendingElicitation: ElicitationRequestPayload | null;
  onRespondElicitation: (answer: ElicitationAnswer) => void;
  showSlashPopover: boolean;
  slashMatches: AcpCommandInfo[];
  slashActiveIndex: number;
  onAcceptSlash: (cmd: AcpCommandInfo) => void;
  onSlashActiveIndexChange: (index: number) => void;
  sending: boolean;
  onSend: () => void;
  onStop: () => void;
  // Only reachable while `sending` and the box has text — see
  // `ChatComposer.tsx`'s `queueMessage`. Sits alongside `onStop`, which stays
  // available throughout.
  onQueue: () => void;
  sendDisabled: boolean;
  // Model/agent + permission-mode pickers (and, for OpenAI-compatible
  // providers, the free-text model id input) — composed by `ChatToolbar.tsx`
  // and slotted in here rather than imported directly, so this component
  // stays about the input box itself, not who's picked to answer it.
  toolbarLeft: ReactNode;
  // `ContextUsageRing`, when there's a usage figure to show at all.
  contextUsage?: ReactNode;
}

// The textarea + send/stop button + its anchored popovers (permission ask,
// the agent's questions, slash-command autocomplete) — the bottom third of `ChatComposer.tsx`.
export default function ChatInputBar({
  input,
  onChange,
  onKeyDown,
  textareaRef,
  shellMode,
  pendingPermission,
  onRespondPermission,
  pendingElicitation,
  onRespondElicitation,
  showSlashPopover,
  slashMatches,
  slashActiveIndex,
  onAcceptSlash,
  onSlashActiveIndexChange,
  sending,
  onSend,
  onStop,
  onQueue,
  sendDisabled,
  toolbarLeft,
  contextUsage,
}: ChatInputBarProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const showQueue = sending && input.trim().length > 0;
  const composeMode = useAppStore((s) => s.composeMode);
  const composerMaxRows = useAppStore((s) => s.composerMaxRows);

  return (
    <div
      ref={boxRef}
      className={cn(
        "relative flex flex-col rounded-xl bg-raised transition-shadow duration-150 mx-4",
        shellMode
          ? "shadow-[0_0_0_1px_rgba(16,185,129,0.6),0_6px_18px_-6px_rgba(0,0,0,0.6)]"
          : "shadow-[var(--al-shadow-floating),0_6px_18px_-6px_rgba(0,0,0,0.6)] focus-within:shadow-[0_0_0_1px_rgba(94,146,255,0.5),0_0_0_3px_rgba(59,130,246,0.1),0_6px_18px_-6px_rgba(0,0,0,0.6)]",
      )}
    >
      {pendingPermission ? (
        <PermissionPopover
          request={pendingPermission}
          onRespond={onRespondPermission}
          anchorRef={boxRef}
        />
      ) : pendingElicitation ? (
        <ElicitationPopover
          key={pendingElicitation.id}
          request={pendingElicitation}
          onRespond={onRespondElicitation}
          anchorRef={boxRef}
        />
      ) : (
        showSlashPopover && (
          <SlashCommandMenu
            matches={slashMatches}
            activeIndex={slashActiveIndex}
            onSelect={onAcceptSlash}
            onActiveIndexChange={onSlashActiveIndexChange}
            anchorRef={boxRef}
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
        <AutoResizeTextarea
          ref={textareaRef}
          defaultValue={input}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={getPlaceholderText(composeMode)}
          minRows={COMPOSER_MIN_ROWS}
          maxRows={composerMaxRows}
          className={cn(
            "py-3 leading-relaxed",
            shellMode
              ? "pl-9 pr-3.5 font-mono text-code text-emerald-200"
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
              bordered
              size="sm"
              onClick={onQueue}
              title="Send after the current turn finishes (Ctrl+Enter)"
            >
              <Clock size={12} />
              <span>Queue</span>
            </Button>
          )}
          <Button
            variant={sending ? "chip-danger" : "chip-primary"}
            size="sm"
            onClick={sending ? onStop : onSend}
            disabled={!sending && sendDisabled}
            title={sending ? "Stop" : "Send"}
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
  );
}
