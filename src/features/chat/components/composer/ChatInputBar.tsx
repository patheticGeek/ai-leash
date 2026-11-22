import { Button } from "@astryxdesign/core/Button";
import { TextArea } from "@astryxdesign/core/TextArea";
import * as stylex from "@stylexjs/stylex";
import { Clock, Send, Square, SquareTerminal } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
} from "react";
import { COMPOSER_MIN_ROWS, usePreference } from "@/data/preferences";
import { cn } from "@/lib/utils";
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

const styles = stylex.create({
  // The composer box around it already paints the surface and the focus
  // ring, so the field's own control box is invisible.
  bareControl: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    boxShadow: { default: "none", ":hover": "none", ":focus-within": "none" },
    outline: "none",
  },
});

// Grows the textarea with its content between `minRows` and `maxRows`
// lines, then scrolls. Re-measured whenever the text changes — typed or
// written programmatically — or the row limits do.
function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  minRows: number,
  maxRows: number,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: value is a trigger-only dep — its contents aren't read, a change just means the text changed
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const minHeight = lineHeight * minRows + paddingY;
    const maxHeight = lineHeight * maxRows + paddingY;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [ref, value, minRows, maxRows]);
}

export interface ChatInputBarProps {
  // Square, edge to edge and without the floating shadow — the board's
  // narrow project chat (see `ChatPanel`'s `compact`).
  flush?: boolean;
  input: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
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
  flush = false,
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
  const composeMode = usePreference("composeMode");
  const composerMaxRows = usePreference("composerMaxRows");
  useAutoGrow(textareaRef, input, COMPOSER_MIN_ROWS, composerMaxRows);

  return (
    <div
      ref={boxRef}
      className={cn(
        "relative flex flex-col bg-raised transition-shadow duration-150",
        flush ? "border-t border-white/5" : "mx-3 rounded-xl",
        flush
          ? shellMode && "shadow-[inset_0_1px_0_rgba(16,185,129,0.6)]"
          : shellMode
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
        <TextArea
          ref={textareaRef}
          label="Message"
          isLabelHidden
          width="100%"
          value={input}
          onChange={onChange}
          onKeyDown={(e) => onKeyDown(e as KeyboardEvent<HTMLTextAreaElement>)}
          placeholder={getPlaceholderText(composeMode)}
          rows={COMPOSER_MIN_ROWS}
          controlXstyle={styles.bareControl}
          // Text styling has to reach the <textarea> inside the control box,
          // which StyleX can't select into; the composer box around it is
          // still Tailwind until its own migration.
          controlClassName={cn(
            "[&_textarea]:resize-none [&_textarea]:py-3 [&_textarea]:leading-relaxed",
            shellMode
              ? "[&_textarea]:pl-9 [&_textarea]:pr-3.5 [&_textarea]:font-mono [&_textarea]:text-code [&_textarea]:text-emerald-200"
              : "[&_textarea]:px-3.5 [&_textarea]:text-zinc-200",
          )}
        />
      </div>
      <div className="flex items-center justify-between gap-1.5 px-2 pb-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {toolbarLeft}
        </div>
        <div className="flex items-center gap-1.5">
          {contextUsage}
          {showQueue && (
            <Button
              variant="secondary"
              size="sm"
              label="Queue"
              icon={<Clock size={12} />}
              onClick={onQueue}
              tooltip="Send after the current turn finishes (Ctrl+Enter)"
            />
          )}
          <Button
            variant={sending ? "chip-danger" : "chip-primary"}
            size="sm"
            label={sending ? "Stop" : "Send"}
            icon={
              sending ? (
                <Square size={12} fill="currentColor" />
              ) : (
                <Send size={14} />
              )
            }
            onClick={sending ? onStop : onSend}
            isDisabled={!sending && sendDisabled}
          />
        </div>
      </div>
    </div>
  );
}
