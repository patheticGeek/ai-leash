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
        <div className="sticky top-1 rounded-md shadow-[0_0_0_1px_rgba(127,29,29,0.5)] bg-red-950/30 px-3 py-2 text-red-300 text-xs">
          {ollamaError}
        </div>
      )}
      {acpRestoreFailed && (
        <div className="sticky top-1 flex items-center justify-between gap-3 rounded-md shadow-[0_0_0_1px_rgba(127,29,29,0.5)] bg-red-950/30 px-3 py-2 text-red-300 text-xs">
          <span>
            This agent couldn't restore its previous session ({acpRestoreFailed}
            ). It no longer remembers this conversation.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={onRetryAcpSession}
          >
            Start new session
          </Button>
        </div>
      )}
      {acpHistoryTruncated && (
        <div className="sticky top-1 rounded-md shadow-[0_0_0_1px_rgba(120,53,15,0.5)] bg-amber-950/30 px-3 py-2 text-amber-300 text-xs">
          {acpAgentLabel ?? "This agent"} doesn't support resuming a previous
          session, so this conversation's earlier history won't be visible to
          it.
        </div>
      )}
    </>
  );
}
