import { useEffect, useState } from "react";
import { useElementHeight } from "@/hooks/useElementHeight";
import { cn } from "@/lib/utils";
import type { AcpCommandInfo } from "../../../../lib/tauriApi";
import { useAppStore } from "../../../../store";
import { useChatInput } from "../../hooks/useChatInput";
import {
  type ChatSession,
  COMPACT_COMMAND,
  LOCAL_COMMANDS,
} from "../../hooks/useChatSession";
import { useMessageQueue } from "../../hooks/useMessageQueue";
import { useSessionElicitation } from "../../hooks/useSessionElicitation";
import { useSessionPermissions } from "../../hooks/useSessionPermissions";
import { useSlashCommands } from "../../hooks/useSlashCommands";
import ChatBanners from "../banners/ChatBanners";
import type { ClaudeRateLimit } from "../banners/ClaudeRateLimitBanner";
import ChatInputBar from "./ChatInputBar";
import ChatToolbar from "./ChatToolbar";
import ContextUsageRing from "./ContextUsageRing";
import CheckoutBar, { type CheckoutBarProps } from "./checkout/CheckoutBar";

interface ChatComposerProps {
  sessionId: string;
  // Pinned to the bottom of the panel over the transcript (a started
  // conversation) rather than flowing in place (the centered "new thread"
  // layout).
  floating: boolean;
  // Which model/agent is picked and the options to pick from — the
  // composer's toolbar renders it and `sending` readiness depends on it.
  session: ChatSession;
  sending: boolean;
  usage: { prompt: number; completion: number; contextLength?: number } | null;
  claudeRateLimit: {
    rateLimit: ClaudeRateLimit | null;
    autoResumeArmed: boolean;
    onArmAutoResume: () => void;
    onDismiss: () => void;
  };
  checkout: CheckoutBarProps;
  // What the composer *decides* — a plain prompt, a shell escape, a "/clear"
  // or "/compact" — is its own; what those actually do to the conversation
  // (talk to the backend, rewrite the transcript) is `ChatPanel`'s.
  onSubmit: (text: string) => void | Promise<void>;
  onRunShell: (command: string) => Promise<void>;
  onCommand: (name: string) => Promise<void>;
  onStop: () => Promise<void>;
  onError: (message: string | null) => void;
  // Called with the dock's rendered height (and again whenever it changes —
  // the box growing, a banner appearing) so the transcript above can leave
  // exactly that much room at its bottom instead of guessing.
  onHeightChange: (height: number) => void;
}

// The whole bottom dock of a conversation: the strips above the message box,
// the box itself with its pickers, the permission ask and slash-command
// autocomplete, the context-usage ring, and the checkout bar beneath it.
// Owns all the state that's only about *typing a message* — the draft text,
// slash autocomplete, "/help" overlay, the queue of messages typed
// mid-turn, permission mode — and interprets what a submit means.
export default function ChatComposer({
  sessionId,
  floating,
  session,
  sending,
  usage,
  claudeRateLimit,
  checkout,
  onSubmit,
  onRunShell,
  onCommand,
  onStop,
  onError,
  onHeightChange,
}: ChatComposerProps) {
  const composeMode = useAppStore((s) => s.composeMode);
  const dockRef = useElementHeight<HTMLDivElement>(onHeightChange);
  const { input, setInput, setInputValue, textareaRef } =
    useChatInput(sessionId);
  const permissions = useSessionPermissions(sessionId, onError);
  const elicitation = useSessionElicitation(sessionId, onError);
  const queue = useMessageQueue(sending, onSubmit);
  // "/help" shows an overlay over the messages area rather than adding an
  // entry to the transcript — closed by its own X button or, more usually,
  // implicitly by sending the next message (see the top of `send()`).
  const [helpOpen, setHelpOpen] = useState(false);
  // Lives here (not in `ChatToolbar`) so "/model" can open the picker
  // without a real click.
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  const { isAcp, model, activeAcpAgent } = session;
  const backendReady = isAcp ? !!activeAcpAgent : !!model;

  // "/compact" only exists for the built-in provider loop — see
  // `COMPACT_COMMAND`. Local commands first, then whatever the connected
  // ACP agent advertises (skipping any name a local command already
  // covers) — see `LOCAL_COMMANDS`.
  const localCommands = isAcp
    ? LOCAL_COMMANDS
    : [...LOCAL_COMMANDS, COMPACT_COMMAND];
  const allCommands = [
    ...localCommands,
    ...session.acpCommands.filter(
      (c) => !localCommands.some((l) => l.name === c.name),
    ),
  ];
  const slash = useSlashCommands(input, allCommands);
  // A dismissed popover is remembered by the query it was dismissed for —
  // that goes stale when the connected agent (and so its command list)
  // changes.
  const acpAgentId = activeAcpAgent?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: acpAgentId is a trigger-only dep — `slash.resetDismissed` is a fresh function every render and must not re-run this
  useEffect(() => {
    slash.resetDismissed();
  }, [acpAgentId]);
  // Mirrors `send()`'s own check — a leading space ("!" escaped as " !")
  // means "just send this as text", so it's not shell mode either.
  const shellMode = input.startsWith("!");

  // Local commands run entirely client-side — never sent to the model/agent
  // as a prompt. Blocked while `sending`: "/clear"/"/compact" mid-turn would
  // let that turn's own `push_message` calls land right back in the history
  // either just wiped or is about to replace (see `chat::clear_conversation`'s
  // doc comment).
  async function runLocalCommand(name: string) {
    if (sending) return;
    setInputValue("");
    if (name === "model") {
      setModelPickerOpen(true);
    } else if (name === "help") {
      setHelpOpen(true);
    } else {
      await onCommand(name);
    }
  }

  async function send() {
    setHelpOpen(false);
    // A leading space before "!" (" !foo") escapes out of shell mode — for
    // when you actually want to send a message starting with "!" as text.
    // Checked on the raw, untrimmed value, since trim() below would
    // otherwise erase the one signal that distinguishes it from the shell
    // escape.
    const isEscapedBang = input.startsWith(" !");
    const text = input.trim();
    // "!<command>" never reaches the model — it runs as a shell command
    // right away (typing it here *is* the approval); see `onRunShell`.
    const bangMatch = !isEscapedBang && /^!(\S.*)$/s.exec(text);
    if (bangMatch) {
      if (sending) return;
      setInputValue("");
      await onRunShell(bangMatch[1]);
      return;
    }
    const localMatch = /^\/(\S+)$/.exec(text);
    if (localMatch && localCommands.some((c) => c.name === localMatch[1])) {
      await runLocalCommand(localMatch[1]);
      return;
    }
    if (!text || sending || !backendReady) return;
    setInputValue("");
    await onSubmit(text);
  }

  // Appends the current input to the back of the queue, delivered in order
  // through `onSubmit` as the turn ahead of it finishes.
  function queueMessage() {
    const text = input.trim();
    if (!text) return;
    queue.enqueue(text);
    setInputValue("");
  }

  async function stop() {
    // An explicit stop means "I don't want this to keep going" — queued
    // messages auto-firing right after would contradict that, so drop them
    // all too.
    queue.clear();
    await onStop();
  }

  function acceptSlashCommand(cmd: AcpCommandInfo) {
    setInputValue(`/${cmd.name} `);
    slash.resetDismissed();
    textareaRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slash.showPopover) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        slash.moveDown();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        slash.moveUp();
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        acceptSlashCommand(slash.matches[slash.activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        slash.dismiss();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      const withModifier = e.ctrlKey || e.metaKey;
      // Compose mode: a plain Enter is just a newline.
      if (composeMode && !withModifier) return;
      e.preventDefault();
      if (sending && withModifier) {
        queueMessage();
        return;
      }
      send();
    }
  }

  const usedTokens = usage ? usage.prompt + usage.completion : null;

  return (
    <div
      ref={dockRef}
      className={cn("w-full", floating && "absolute bottom-0")}
    >
      <div className="mx-auto max-w-4xl my-3">
        <ChatBanners
          helpOpen={helpOpen}
          commands={allCommands}
          onCloseHelp={() => setHelpOpen(false)}
          claudeRateLimit={claudeRateLimit.rateLimit}
          claudeAutoResumeArmed={claudeRateLimit.autoResumeArmed}
          onArmAutoResume={claudeRateLimit.onArmAutoResume}
          onDismissRateLimit={claudeRateLimit.onDismiss}
          queuedMessages={queue.queued}
          onCancelQueued={queue.remove}
        />
        <ChatInputBar
          input={input}
          onChange={setInput}
          onKeyDown={onKeyDown}
          textareaRef={textareaRef}
          shellMode={shellMode}
          pendingPermission={permissions.pendingPermission}
          onRespondPermission={permissions.respondPermission}
          pendingElicitation={elicitation.pendingElicitation}
          onRespondElicitation={elicitation.respondElicitation}
          showSlashPopover={slash.showPopover}
          slashMatches={slash.matches}
          slashActiveIndex={slash.activeIndex}
          onAcceptSlash={acceptSlashCommand}
          onSlashActiveIndexChange={slash.setActiveIndex}
          sending={sending}
          onSend={send}
          onStop={stop}
          onQueue={queueMessage}
          sendDisabled={!input.trim() || !backendReady}
          toolbarLeft={
            <ChatToolbar
              backendOptions={session.backendOptions}
              activeBackendKey={session.activeBackendKey}
              activeBackendLabel={session.activeBackendLabel}
              onSelectBackend={session.selectBackendOption}
              modelSwitchPending={session.acpModelSwitchPending}
              modelPickerOpen={modelPickerOpen}
              onModelPickerOpenChange={setModelPickerOpen}
              isAcp={isAcp}
              effortOptions={session.acpEffortOptions}
              effortChoice={session.acpEffortChoice}
              onSelectEffort={session.selectAcpEffort}
              permissionMode={permissions.permissionMode}
              onSelectPermissionMode={permissions.setPermissionMode}
              showModelIdInput={session.isOpenAiCompatible && !isAcp}
              model={model}
              onModelChange={session.setModel}
            />
          }
          contextUsage={
            usedTokens !== null && (
              <ContextUsageRing
                usedTokens={usedTokens}
                contextLength={usage?.contextLength ?? session.contextLength}
              />
            )
          }
        />
        <CheckoutBar {...checkout} />
      </div>
    </div>
  );
}
