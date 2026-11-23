import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";

interface TranscriptNoticesProps {
  chatError: string | null;
  acpRestoreFailed: string | null;
  onRetryAcpSession: () => void;
  // True when the connected ACP agent has no way to pick up this
  // conversation's prior history (no `session/load` resume available) —
  // distinct from `acpRestoreFailed` (a resume was *attempted* and failed);
  // this is "never even had one to try." See `chat://{sessionId}/acp_history_truncated`.
  acpHistoryTruncated: boolean;
  acpAgentLabel: string | null;
}

// The conversation's error/warning notices — provider error, failed ACP
// session restore, and the "this agent can't resume history" heads-up — as
// stock `Banner`s at the top of the banner stack above the composer
// (`ChatComposer`'s `notices`), errors first, then the warning; the
// stack's own info/warning strips follow. The theme backs banner frames
// with the solid card surface, so they read over the transcript.
// Top-level-conversation-only — a sub-agent's transcript has none.
export default function TranscriptNotices({
  chatError,
  acpRestoreFailed,
  onRetryAcpSession,
  acpHistoryTruncated,
  acpAgentLabel,
}: TranscriptNoticesProps) {
  return (
    <>
      {chatError && (
        <Banner
          status="error"
          role="alert"
          title="Error"
          description={chatError}
          collapsible={false}
        />
      )}
      {acpRestoreFailed && (
        <Banner
          status="error"
          role="alert"
          title="Couldn't restore the previous session"
          description={`${acpRestoreFailed}. This agent no longer remembers this conversation.`}
          endContent={
            <Button
              variant="secondary"
              size="sm"
              label="Start new session"
              onClick={onRetryAcpSession}
            />
          }
          collapsible={false}
        />
      )}
      {acpHistoryTruncated && (
        <Banner
          status="warning"
          title="Earlier history not shared"
          description={`${acpAgentLabel ?? "This agent"} doesn't support resuming a previous session, so this conversation's earlier history won't be visible to it.`}
          collapsible={false}
        />
      )}
    </>
  );
}
