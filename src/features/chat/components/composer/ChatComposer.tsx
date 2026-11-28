import { Button } from "@astryxdesign/core/Button";
import {
  ChatComposer as AstryxChatComposer,
  ChatComposerDrawer,
  ChatSendButton,
} from "@astryxdesign/core/Chat";
import { Token } from "@astryxdesign/core/Token";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { Clock, MessageSquare, Paperclip } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useModelVision } from "@/data/backends";
import { usePreference } from "@/data/preferences";
import { useElementHeight } from "@/hooks/useElementHeight";
import { rememberMention } from "@/lib/mentions";
import { useActiveCheckoutPath } from "@/lib/useActiveCheckoutPath";
import {
  type AcpCommandInfo,
  type Attachment,
  api,
} from "../../../../lib/tauriApi";
import { reviewCommentsFor, useAppStore } from "../../../../store";
import ReviewDrawer from "../../../review/ReviewDrawer";
import {
  type AnchoredComment,
  anchorComment,
  formatReview,
  linesOf,
  relativePath,
  reviewMentions,
} from "../../../review/reviewComments";
import { useAttachments } from "../../hooks/useAttachments";
import { useChatInput } from "../../hooks/useChatInput";
import {
  type ChatSession,
  COMPACT_COMMAND,
  LOCAL_COMMANDS,
} from "../../hooks/useChatSession";
import { useComposerFocusRequest } from "../../hooks/useComposerFocusRequest";
import { useMentionPicker } from "../../hooks/useMentionPicker";
import { useMessageQueue } from "../../hooks/useMessageQueue";
import { useSessionElicitation } from "../../hooks/useSessionElicitation";
import { useSessionPermissions } from "../../hooks/useSessionPermissions";
import { useSlashCommands } from "../../hooks/useSlashCommands";
import ChatBanners from "../banners/ChatBanners";
import type { ClaudeRateLimit } from "../banners/ClaudeRateLimitBanner";
import type { TranscriptNoticesProps } from "../banners/TranscriptNotices";
import AttachmentChips, { PendingThumbnail } from "../messages/AttachmentChips";
import ElicitationPrompt from "../popovers/ElicitationPrompt";
import MentionMenu from "../popovers/MentionMenu";
import PermissionPrompt from "../popovers/PermissionPrompt";
import SlashCommandMenu from "../popovers/SlashCommandMenu";
import ChatToolbar from "./ChatToolbar";
import ComposerInput from "./ComposerInput";
import ContextUsage from "./ContextUsage";
import CheckoutBar, { type CheckoutBarProps } from "./checkout/CheckoutBar";
import QueuedDrawer from "./QueuedDrawer";

// The transcript column's width (`ChatEntryList`'s `COLUMN_WIDTH`), so the
// dock lines up with the messages above it.
const COLUMN_WIDTH = 800;

const styles = stylex.create({
  dock: {
    width: "100%",
    paddingBlock: spacingVars["--spacing-3"],
    paddingInline: spacingVars["--spacing-4"],
  },
  // Pinned over the bottom of the transcript, centred on its column.
  floating: {
    position: "absolute",
    insetBlockEnd: 0,
    insetInline: 0,
  },
  // The strip under the box while the dock floats (the checkout bar, or
  // just the dock's bottom padding without one): the transcript scrolls on
  // under it and fades out going down, from transparent at the box's bottom
  // edge to the page colour (the elevated AppShell's surface) at the
  // window's, so the chat visibly goes away behind the worktree/branch
  // pickers (which carry their own backdrop, `PickerTrigger`). The box itself
  // is an opaque card and needs nothing behind it. The layer reaches up over
  // the gap above the strip and out over the dock's padding (sides and
  // bottom); `isolation` keeps it behind the strip's content without
  // dropping it under the transcript.
  fadeTail: {
    position: "relative",
    isolation: "isolate",
    "::before": {
      content: '""',
      position: "absolute",
      zIndex: -1,
      insetBlockStart: `calc(-1 * ${spacingVars["--spacing-2"]})`,
      insetBlockEnd: `calc(-1 * ${spacingVars["--spacing-3"]})`,
      insetInline: `calc(-1 * ${spacingVars["--spacing-4"]})`,
      backgroundImage: `linear-gradient(to bottom, transparent, ${colorVars["--color-background-surface"]})`,
      pointerEvents: "none",
    },
  },
  // The compact dock's padding (`compact` below).
  fadeTailCompact: {
    "::before": {
      insetBlockEnd: `calc(-1 * ${spacingVars["--spacing-2"]})`,
      insetInline: `calc(-1 * ${spacingVars["--spacing-2"]})`,
    },
  },
  // No checkout bar: the strip is empty and takes back the gap it would
  // add, so its layer is just the dock's bottom padding.
  fadeTailEmpty: {
    marginBlockStart: `calc(-1 * ${spacingVars["--spacing-2"]})`,
    "::before": { insetBlockStart: 0 },
  },
  column: {
    maxWidth: COLUMN_WIDTH,
    marginInline: "auto",
  },
  compact: {
    paddingInline: spacingVars["--spacing-2"],
    paddingBlockStart: spacingVars["--spacing-2"],
    paddingBlockEnd: spacingVars["--spacing-2"],
  },
});

interface ChatComposerProps {
  // null for a new thread that hasn't sent its first message yet.
  sessionId: string | null;
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
  // The conversation's own notices (`TranscriptNotices`), sorted into the
  // banner stack by severity with the composer's own.
  notices?: TranscriptNoticesProps;
  // A narrow column (see `ChatPanel`'s `compact`): full width of it, with
  // a compact composer.
  compact: boolean;
  showCheckout: boolean;
  // What the composer *decides* — a plain prompt, a shell escape, a "/clear"
  // or "/compact" — is its own; what those actually do to the conversation
  // (talk to the backend, rewrite the transcript) is `ChatPanel`'s.
  // `takeOver`: see `api.sendPrompt`. `attachments`: the files attached in
  // the box (`useAttachments`), already staged.
  onSubmit: (
    text: string,
    takeOver: boolean,
    attachments: Attachment[],
  ) => Promise<void>;
  // Asked before a message is sent or queued: in a task chat the project
  // chat follows, whether this takes it over (`TakeOverDialog`). True or
  // false to go ahead, null if the user backed out.
  onAskTakeOver: () => Promise<boolean | null>;
  // Takes the task over right away — the answer for a queued message.
  onTakeOver: () => Promise<void>;
  onRunShell: (command: string) => Promise<void>;
  onCommand: (name: string) => Promise<void>;
  // Resolves to false if the user backed out of stopping.
  onStop: () => Promise<boolean>;
  onError: (message: string | null) => void;
  // Called with the dock's rendered height (and again whenever it changes —
  // the box growing, a banner appearing) so the transcript above can leave
  // exactly that much room at its bottom instead of guessing.
  onHeightChange: (height: number) => void;
}

// The whole bottom dock of a conversation, top to bottom: the banner stack
// (`ChatBanners`), the Astryx `ChatComposer` — our textarea in its input
// slot (with the `@` file picker, `MentionMenu`, above it), the attachments
// (`AttachmentChips`), draft review comments (`ReviewDrawer`) and queued
// messages in its drawer, the attach button and pickers in its footer
// and context usage beside Send —
// or, while the agent is asking something, the permission / question prompt
// in its place, and the checkout bar beneath. The running sub-agents banner
// (#26) is the banner stack's last item, right above the composer.
// Owns all the state that's only about *typing a message* — the draft text,
// slash and `@` autocomplete, "/help" overlay, the queue of messages typed
// mid-turn, permission mode — and interprets what a submit means.
export default function ChatComposer({
  sessionId,
  floating,
  session,
  sending,
  usage,
  claudeRateLimit,
  checkout,
  notices,
  compact,
  showCheckout,
  onSubmit,
  onAskTakeOver,
  onTakeOver,
  onRunShell,
  onCommand,
  onStop,
  onError,
  onHeightChange,
}: ChatComposerProps) {
  const composeMode = usePreference("composeMode");
  const dockRef = useElementHeight<HTMLDivElement>(onHeightChange);
  // What the slash menu anchors to: the composer's frame.
  const composerRef = useRef<HTMLDivElement>(null);
  const { input, setInput, setInputValue, textareaRef } =
    useChatInput(sessionId);
  // `/` from anywhere (and the palette's "Focus message box") lands here.
  useComposerFocusRequest(textareaRef);
  const permissions = useSessionPermissions(
    sessionId,
    !!session.modeOptions,
    onError,
  );
  const elicitation = useSessionElicitation(sessionId, onError);
  // A queued message was asked about when it was queued, so it goes as is.
  const queue = useMessageQueue(
    sending,
    ({ text, attachments }) => void onSubmit(text, false, attachments),
  );
  // Files attached in the box — pasted, dropped anywhere on the dock, or
  // picked with the attach button.
  const attach = useAttachments(
    dockRef,
    onError,
    session.imagesUnsupportedReason,
  );
  // `sending` as of now, for after an await.
  const sendingRef = useRef(sending);
  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);
  // "/help" shows a banner above the composer rather than adding an entry
  // to the transcript — closed by its own dismiss button or, more usually,
  // implicitly by sending the next message (see the top of `send()`).
  const [helpOpen, setHelpOpen] = useState(false);
  // Lives here (not in `ChatToolbar`) so "/model" can open the picker
  // without a real click.
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  // Draft review comments left on file lines (`features/review/`).
  const reviewComments = useAppStore((s) => reviewCommentsFor(s, sessionId));
  const deleteReviewComment = useAppStore((s) => s.deleteReviewComment);
  const checkoutPath = useActiveCheckoutPath();

  const { backend, model } = session;
  const backendReady = backend.ready;

  // "/compact" only for a backend that can summarize (`caps.compaction`) —
  // see `COMPACT_COMMAND`. Local commands first, then whatever the connected
  // agent advertises (skipping any name a local command already covers) —
  // see `LOCAL_COMMANDS`.
  const localCommands = backend.caps.compaction
    ? [...LOCAL_COMMANDS, COMPACT_COMMAND]
    : LOCAL_COMMANDS;
  const allCommands = [
    ...localCommands,
    ...session.agentCommands.filter(
      (c) => !localCommands.some((l) => l.name === c.name),
    ),
  ];
  const slash = useSlashCommands(input, allCommands);
  const mention = useMentionPicker(
    input,
    setInputValue,
    textareaRef,
    useActiveCheckoutPath(),
  );
  // A dismissed popover is remembered by the query it was dismissed for —
  // that goes stale when the connected agent (and so its command list)
  // changes.
  const backendId = backend.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: backendId is a trigger-only dep — `slash.resetDismissed` is a fresh function every render and must not re-run this
  useEffect(() => {
    slash.resetDismissed();
  }, [backendId]);
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
    const hasAttachments = attach.attachments.length > 0;
    if ((!text && !hasAttachments) || sending || !backendReady) return;
    // Still copying one in: send once it's there.
    if (attach.pending.length > 0) return;
    setInputValue("");
    const attachments = attach.take();
    const takeOver = await onAskTakeOver();
    if (takeOver === null) {
      setInputValue(text);
      attach.restore(attachments);
      return;
    }
    await onSubmit(text, takeOver, attachments);
  }

  // Appends the current input to the back of the queue, delivered in order
  // through `onSubmit` as the turn ahead of it finishes. The takeover
  // question comes now, not when it's sent: taking over releases the task
  // at once, so the turn still running isn't forwarded either.
  async function queueMessage() {
    const text = input.trim();
    if ((!text && attach.attachments.length === 0) || attach.pending.length > 0)
      return;
    setInputValue("");
    const attachments = attach.take();
    const takeOver = await onAskTakeOver();
    if (takeOver === null) {
      setInputValue(text);
      attach.restore(attachments);
      return;
    }
    if (takeOver) await onTakeOver();
    // The turn may have ended while the dialog was open, and the queue only
    // flushes when it does.
    if (sendingRef.current) queue.enqueue({ text, attachments });
    else await onSubmit(text, false, attachments);
  }

  // "Send review": every draft comment, re-anchored in its file's current
  // text (the open tab's, else the file on disk), as one message — with
  // whatever's in the box as the review's overall note.
  async function sendReview() {
    if (!sessionId || sending || !backendReady) return;
    const comments = reviewComments;
    if (comments.length === 0 || attach.pending.length > 0) return;
    const note = input.trim();
    const { openFiles } = useAppStore.getState();
    const anchored = await Promise.all(
      comments.map(async (comment): Promise<AnchoredComment> => {
        let content = openFiles.find((f) => f.path === comment.path)?.content;
        if (content === undefined) {
          content = await api
            .readFileText(sessionId, comment.path)
            .catch(() => undefined);
        }
        const anchor =
          content === undefined
            ? {
                startLine: comment.startLine,
                endLine: comment.endLine,
                outdated: true,
              }
            : anchorComment(comment, content);
        return {
          comment,
          anchor,
          code:
            anchor.outdated || content === undefined
              ? comment.snippet
              : linesOf(content, anchor.startLine, anchor.endLine),
          relPath: relativePath(comment.path, checkoutPath),
        };
      }),
    );
    setHelpOpen(false);
    setInputValue("");
    const attachments = attach.take();
    const takeOver = await onAskTakeOver();
    if (takeOver === null) {
      setInputValue(note);
      attach.restore(attachments);
      return;
    }
    // The files it attaches show as chips on the sent message, like picked
    // `@` mentions.
    for (const path of reviewMentions(anchored)) rememberMention(path);
    await onSubmit(formatReview(anchored, note), takeOver, attachments);
    // Only the ones sent: more may have been left while it went out.
    for (const c of comments) deleteReviewComment(sessionId, c.id);
  }

  async function stop() {
    // An explicit stop means "I don't want this to keep going" — queued
    // messages auto-firing right after would contradict that, so drop them
    // all too.
    const queued = queue.queued;
    queue.clear();
    if ((await onStop()) === false) queue.restore(queued);
  }

  function acceptSlashCommand(cmd: AcpCommandInfo) {
    setInputValue(`/${cmd.name} `);
    slash.resetDismissed();
    textareaRef.current?.focus();
  }

  // Typing: the text and, for the `@` picker, the caret, in one render.
  function onInputChange(value: string) {
    setInput(value);
    mention.syncCaret(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention.onKeyDown(e)) return;
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
        void queueMessage();
        return;
      }
      send();
    }
  }

  const usedTokens = usage ? usage.prompt + usage.completion : null;
  const hasImages = attach.attachments.some((a) => a.kind === "image");
  const vision = useModelVision(
    backend.kind === "acp" ? "" : backend.id,
    model,
    hasImages,
  );
  const hasAttachments =
    attach.attachments.length > 0 || attach.pending.length > 0;
  const hasContent = input.trim().length > 0 || attach.attachments.length > 0;
  const showQueue = sending && hasContent;
  const hasReview = sessionId !== null && reviewComments.length > 0;
  const sendDisabled =
    !hasContent || attach.pending.length > 0 || !backendReady;
  const { pendingPermission, respondPermission } = permissions;
  const { pendingElicitation, respondElicitation } = elicitation;

  return (
    <VStack
      ref={dockRef}
      gap={2}
      xstyle={[
        styles.dock,
        floating && styles.floating,
        compact ? styles.compact : styles.column,
      ]}
    >
      <ChatBanners
        sessionId={sessionId}
        notices={notices}
        claudeRateLimit={claudeRateLimit.rateLimit}
        claudeAutoResumeArmed={claudeRateLimit.autoResumeArmed}
        onArmAutoResume={claudeRateLimit.onArmAutoResume}
        onDismissRateLimit={claudeRateLimit.onDismiss}
        helpOpen={helpOpen}
        commands={allCommands}
        onCloseHelp={() => setHelpOpen(false)}
        noVisionModel={hasImages && vision === false ? model : null}
      />
      <VStack gap={2}>
        {pendingPermission ? (
          <PermissionPrompt
            request={pendingPermission}
            onRespond={respondPermission}
          />
        ) : pendingElicitation ? (
          <ElicitationPrompt
            key={pendingElicitation.id}
            request={pendingElicitation}
            onRespond={respondElicitation}
          />
        ) : (
          <AstryxChatComposer
            ref={composerRef}
            value={input}
            onChange={onInputChange}
            // Send / Stop go through `ChatSendButton` below and Enter through
            // `onKeyDown`; this is only the shell's own submit path.
            onSubmit={() => void send()}
            onStop={() => void stop()}
            isStopShown={sending}
            density={compact ? "compact" : "balanced"}
            drawer={
              queue.queued.length > 0 ||
              hasReview ||
              hasAttachments ||
              attach.isDragOver ? (
                <>
                  {(hasAttachments || attach.isDragOver) && (
                    <ChatComposerDrawer
                      label="Attachments"
                      aria-label="Attachments"
                    >
                      <AttachmentChips
                        attachments={attach.attachments}
                        onRemove={attach.remove}
                        isInDrawer
                      />
                      {attach.pending.map((p) => (
                        <PendingThumbnail key={p.key} label={p.name} />
                      ))}
                      {attach.isDragOver && (
                        <Token
                          label="Drop to attach"
                          icon={<Paperclip size={14} />}
                        />
                      )}
                    </ChatComposerDrawer>
                  )}
                  {sessionId && hasReview && (
                    <ReviewDrawer
                      sessionId={sessionId}
                      comments={reviewComments}
                    />
                  )}
                  {queue.queued.length > 0 && (
                    <QueuedDrawer
                      messages={queue.queued}
                      onCancel={queue.remove}
                    />
                  )}
                </>
              ) : undefined
            }
            input={
              <ComposerInput
                value={input}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                onPaste={attach.onPaste}
                textareaRef={textareaRef}
                shellMode={shellMode}
              />
            }
            footerActions={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  label="Attach files"
                  isIconOnly
                  icon={<Paperclip size={14} />}
                  onClick={() =>
                    void attach.pickFiles().catch((e) => onError(String(e)))
                  }
                  tooltip={
                    session.imagesUnsupportedReason
                      ? `Attach files from anywhere (or paste or drop them here). No images: ${session.imagesUnsupportedReason}`
                      : "Attach images or files from anywhere (or paste or drop them here)"
                  }
                />
                <ChatToolbar
                  backendOptions={session.backendOptions}
                  activeBackendKey={session.activeBackendKey}
                  activeBackendLabel={session.activeBackendLabel}
                  sendBlockedReason={session.sendBlockedReason}
                  onSelectBackend={session.selectBackendOption}
                  modelSwitchPending={session.modelSwitchPending}
                  modelPickerOpen={modelPickerOpen}
                  onModelPickerOpenChange={setModelPickerOpen}
                  effortOptions={session.effortOptions}
                  effortChoice={session.effortChoice}
                  onSelectEffort={session.selectEffort}
                  permissionMode={permissions.permissionMode}
                  onSelectPermissionMode={permissions.setPermissionMode}
                  modeOptions={session.modeOptions}
                  modeChoice={session.modeChoice}
                  onSelectMode={session.selectMode}
                  showModelIdInput={backend.caps.freeTextModel}
                  model={model}
                  onModelChange={session.setModel}
                />
              </>
            }
            // Context usage sits here, beside Send, rather than in the header
            // (`headerContext`): alone up there it made a header row with
            // nothing on its left, so the text started a whole row lower than
            // the footer sits above the bottom edge.
            sendActions={
              usedTokens !== null || showQueue || hasReview ? (
                <>
                  {usedTokens !== null && (
                    <ContextUsage
                      usedTokens={usedTokens}
                      contextLength={
                        usage?.contextLength ?? session.contextLength
                      }
                    />
                  )}
                  {hasReview && (
                    <Button
                      variant="secondary"
                      size="sm"
                      label={`Send review (${reviewComments.length})`}
                      icon={<MessageSquare size={14} />}
                      isDisabled={sending || !backendReady}
                      onClick={() => void sendReview()}
                      tooltip={
                        sending
                          ? "Send once the agent's turn finishes"
                          : "Send every comment as one message, with what's in the box as an overall note"
                      }
                    />
                  )}
                  {showQueue && (
                    <Button
                      variant="ghost"
                      size="sm"
                      label="Queue"
                      icon={<Clock size={14} />}
                      onClick={() => void queueMessage()}
                      tooltip="Send after the current turn finishes (Ctrl+Enter)"
                    />
                  )}
                </>
              ) : undefined
            }
            sendButton={
              <ChatSendButton
                isStopShown={sending}
                isDisabled={!sending && sendDisabled}
                onSend={() => void send()}
                onStop={() => void stop()}
              />
            }
          />
        )}
        {mention.showPopover && !pendingPermission && !pendingElicitation && (
          <MentionMenu {...mention.menu} anchorRef={composerRef} />
        )}
        {slash.showPopover && !pendingPermission && !pendingElicitation && (
          <SlashCommandMenu
            matches={slash.matches}
            activeIndex={slash.activeIndex}
            onSelect={acceptSlashCommand}
            onActiveIndexChange={slash.setActiveIndex}
            anchorRef={composerRef}
          />
        )}
        {floating ? (
          <VStack
            xstyle={[
              styles.fadeTail,
              compact && styles.fadeTailCompact,
              !showCheckout && styles.fadeTailEmpty,
            ]}
          >
            {showCheckout && <CheckoutBar {...checkout} />}
          </VStack>
        ) : (
          showCheckout && <CheckoutBar {...checkout} />
        )}
      </VStack>
    </VStack>
  );
}
