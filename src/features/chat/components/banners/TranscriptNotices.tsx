import { Alert, AlertAction, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";

interface TranscriptNoticesProps {
  ollamaError: string | null;
  acpRestoreFailed: string | null;
  onRetryAcpSession: () => void;
  // True when the connected ACP agent has no way to pick up this
  // conversation's prior history (no `session/load` resume available) —
  // distinct from `acpRestoreFailed` (a resume was *attempted* and failed);
  // this is "never even had one to try." See `chat://{sessionId}/acp_history_truncated`.
  acpHistoryTruncated: boolean;
  acpAgentLabel: string | null;
}

// The sticky error/warning strips pinned to the top of the transcript:
// provider error, failed ACP session restore, and the "this agent can't
// resume history" heads-up. Top-level-conversation-only — a sub-agent's
// transcript never renders any of them.
export default function TranscriptNotices({
  ollamaError,
  acpRestoreFailed,
  onRetryAcpSession,
  acpHistoryTruncated,
  acpAgentLabel,
}: TranscriptNoticesProps) {
  return (
    <>
      {ollamaError && (
        <Alert variant="danger" outline className="sticky top-1">
          <AlertDescription>{ollamaError}</AlertDescription>
        </Alert>
      )}
      {acpRestoreFailed && (
        <Alert variant="danger" outline className="sticky top-1">
          <AlertDescription>
            This agent couldn't restore its previous session ({acpRestoreFailed}
            ). It no longer remembers this conversation.
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={onRetryAcpSession}>
              Start new session
            </Button>
          </AlertAction>
        </Alert>
      )}
      {acpHistoryTruncated && (
        <Alert variant="warning" outline className="sticky top-1">
          <AlertDescription>
            {acpAgentLabel ?? "This agent"} doesn't support resuming a previous
            session, so this conversation's earlier history won't be visible to
            it.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
