import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";

export interface TranscriptNoticesProps {
  // A provider/agent error from the last send — HTTP failures, a lost
  // connection, an agent process that died mid-turn all arrive here.
  chatError: string | null;
  onDismissChatError: () => void;
  acpRestoreFailed: string | null;
  onRetryAcpSession: () => void;
  // True when the connected ACP agent has no way to pick up this
  // conversation's prior history (no `session/load` resume available) —
  // distinct from `acpRestoreFailed` (a resume was *attempted* and failed);
  // this is "never even had one to try." See `chat://{sessionId}/acp_history_truncated`.
  acpHistoryTruncated: boolean;
  acpAgentLabel: string | null;
}

// The conversation's own notices — provider error, failed ACP session
// restore, and the "this agent can't resume history" heads-up — as stock
// `Banner`s in the composer's banner stack (`ChatBanners`). The stack runs
// errors → warnings → info, so it renders this twice: once for the errors
// (`severity="error"`) at the very top, once for the warning after them.
// Top-level-conversation-only — a sub-agent's transcript has none.
export default function TranscriptNotices({
  severity,
  chatError,
  onDismissChatError,
  acpRestoreFailed,
  onRetryAcpSession,
  acpHistoryTruncated,
  acpAgentLabel,
}: TranscriptNoticesProps & { severity: "error" | "warning" }) {
  if (severity === "warning") {
    return (
      acpHistoryTruncated && (
        <Banner
          status="warning"
          elevation="low"
          collapsible={false}
          isDismissable
          dismissLabel="Dismiss"
          title="Earlier history not shared"
          description={`${acpAgentLabel ?? "This agent"} doesn't support resuming a previous session, so this conversation's earlier history won't be visible to it.`}
        />
      )
    );
  }
  return (
    <>
      {chatError && (
        <Banner
          // A dismissed Banner hides itself; keyed on the text so the next,
          // different error shows again.
          key={chatError}
          status="error"
          elevation="low"
          collapsible={false}
          isDismissable
          dismissLabel="Dismiss"
          onDismiss={onDismissChatError}
          title="Error"
          description={chatError}
        />
      )}
      {acpRestoreFailed && (
        <Banner
          status="error"
          elevation="low"
          collapsible={false}
          title="Couldn't restore the previous session"
          description={`${acpRestoreFailed}. This agent no longer remembers this conversation.`}
          endContent={
            <Button
              variant="primary"
              size="sm"
              label="Start new session"
              onClick={onRetryAcpSession}
            />
          }
        />
      )}
    </>
  );
}
