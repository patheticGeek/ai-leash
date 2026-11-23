// The chat's banners, popups and alerts, one route each, all on the real chat
// screen so they're seen in place. Each piece is a stock Astryx component:
//   strips docked on the composer -> Banner (warning / info / error), the
//                                    composer's own ChatComposerDrawer (queued)
//   slash / @ menus               -> ChatComposerInput triggers (Typeahead)
//   pickers                       -> DropdownMenu (opened by the screenshot)
//   permission / question         -> the prompt Card that takes the box's place
//   toasts                        -> useToast()
//   confirms                      -> AlertDialog
//   tooltips                      -> IconButton tooltip (hovered by the shot)
//   empty / loading / error       -> EmptyState, Skeleton
//   running sub-agents            -> SubAgentsPill (planned)
import { useEffect, type ReactNode } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/Stack";
import { useToast } from "@astryxdesign/core/Toast";
import {
  AgentErrorNotice,
  ChatErrorNotice,
  HelpPanel,
  HistoryTruncatedNotice,
  RestoreFailedNotice,
  ElicitationPrompt,
  MessageComposer,
  PermissionPrompt,
  RateLimitNotice,
  SubAgentsPill,
  TaskLinkNotice,
} from "../chat/Composer";
import Transcript, { TranscriptState } from "../chat/Transcript";
import ChatScreen, { type ChatOverrides } from "./ChatScreen";

const QUEUED = [
  "Also run the board tests once the edit lands",
  "Then update docs/features/project-board.md",
  "Ping the project chat when it's in Review",
];

const idleBox = <MessageComposer />;
// An idle composer goes with a finished turn (no "Working for").
const done = { transcript: <Transcript isWorking={false} /> };
const workingBox = <MessageComposer isWorking />;

function Toasts() {
  const showToast = useToast();
  useEffect(() => {
    const dismiss = [
      showToast({ body: "Task #42 moved to Review", isAutoHide: false, endContent: <Button label="Open" variant="ghost" size="sm" /> }),
      showToast({ body: "Copied", isAutoHide: false }),
      showToast({
        type: "error",
        body: "Couldn't remove worktree task-38: it has uncommitted changes",
        isAutoHide: false,
        endContent: <Button label="Show" variant="ghost" size="sm" />,
      }),
    ];
    return () => dismiss.forEach((d) => d());
  }, [showToast]);
  return null;
}

function Confirm({ kind }: { kind: "delete" | "finish" }) {
  return kind === "delete" ? (
    <AlertDialog
      isOpen
      onOpenChange={() => {}}
      title="Delete this conversation?"
      description="“#42 Astryx: board on the kanban template” and its transcript are deleted. Its worktree and branch stay."
      actionLabel="Delete conversation"
      onAction={() => {}}
    />
  ) : (
    <AlertDialog
      isOpen
      onOpenChange={() => {}}
      title="Finish task #42 with uncommitted changes?"
      description="Worktree task-42 has 3 uncommitted files. Removing it deletes those changes; keeping it leaves the task in Review."
      cancelLabel="Keep it open"
      actionLabel="Remove worktree"
      onAction={() => {}}
    />
  );
}

const stack = (...items: ReactNode[]) => <VStack gap={2}>{items}</VStack>;

export const CHAT_STATES: Record<string, ChatOverrides> = {
  // Strips docked to the composer
  "strip-queued-1": { box: <MessageComposer isWorking queued={QUEUED.slice(0, 1)} /> },
  "strip-queued-3": { box: <MessageComposer isWorking queued={QUEUED} /> },
  "strip-rate-limit": { ...done, top: <RateLimitNotice isCountingDown />, box: idleBox },
  "strip-task-link": { ...done, top: <TaskLinkNotice isUnfollowed />, box: idleBox },
  "strip-error-crash": { ...done, top: <AgentErrorNotice kind="crash" />, box: idleBox },
  "strip-error-connection": { ...done, top: <AgentErrorNotice kind="connection" />, box: idleBox },
  "strip-help": { ...done, top: <HelpPanel />, box: idleBox },
  // Conversation notices (were sticky at the transcript top; now in the stack)
  "notice-error": { ...done, top: <ChatErrorNotice />, box: idleBox },
  "notice-restore-failed": { ...done, top: <RestoreFailedNotice />, box: idleBox },
  "notice-history-truncated": { ...done, top: <HistoryTruncatedNotice />, box: idleBox },
  "notice-stacked": { ...done, top: stack(<ChatErrorNotice key="e" />, <HistoryTruncatedNotice key="h" />), box: idleBox },
  // Popups (the screenshot opens them)
  "popup-slash": { ...done, box: idleBox },
  "popup-mention": { ...done, box: idleBox },
  "popup-model": { ...done, box: idleBox },
  "popup-effort": { ...done, box: idleBox },
  "popup-permission": { ...done, box: idleBox },
  // Prompts that take the composer's place
  "prompt-permission": { top: undefined, box: <PermissionPrompt /> },
  "prompt-question": { top: undefined, box: <ElicitationPrompt /> },
  // Toasts, confirms, tooltips
  toasts: { box: workingBox, overlay: <Toasts /> },
  "confirm-delete-conversation": { box: workingBox, overlay: <Confirm kind="delete" /> },
  "confirm-finish-task": { ...done, box: idleBox, overlay: <Confirm kind="finish" /> },
  tooltip: { box: workingBox },
  // Empty / loading / error: transcript + Sub agents, then Actions
  "state-empty": { transcript: <TranscriptState state="empty" />, box: idleBox, panelTab: "subagents", listState: "empty" },
  "state-loading": { transcript: <TranscriptState state="loading" />, box: idleBox, panelTab: "subagents", listState: "loading" },
  "state-error": { transcript: <TranscriptState state="error" />, box: idleBox, panelTab: "subagents", listState: "error" },
  "state-actions-empty": { box: workingBox, panelTab: "actions", listState: "empty" },
  "state-actions-loading": { box: workingBox, panelTab: "actions", listState: "loading" },
  "state-actions-error": { box: workingBox, panelTab: "actions", listState: "error" },
  // Planned: running sub-agents above the composer
  "pill-subagents": { top: <SubAgentsPill />, box: workingBox },
  "pill-subagents-open": { top: stack(<SubAgentsPill key="p" isOpen />), box: workingBox },
};

export default function ChatStatesScreen({ state }: { state: string }) {
  return <ChatScreen overrides={CHAT_STATES[state]} />;
}
