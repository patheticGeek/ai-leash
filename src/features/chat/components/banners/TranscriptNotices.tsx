import { Alert, AlertAction, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";

// Pinned to the top of the scroller. The `z-10` matters: each message is a
// `MessageScrollerItem` with `content-visibility: auto`, which gives it its
// own stacking context, so without a z-index every later message paints over
// a sticky notice as it scrolls past.
const STICKY = "sticky top-1 z-10";

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
        <Alert variant="danger" outline className={STICKY}>
          <AlertDescription>{ollamaError}</AlertDescription>
        </Alert>
      )}
      {acpRestoreFailed && (
        <Alert variant="danger" outline className={STICKY}>
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
        <Alert variant="warning" outline className={STICKY}>
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
