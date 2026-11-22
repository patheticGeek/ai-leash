import { Banner } from "@astryxdesign/core/Banner";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/ui/button";

// Pinned to the top of the transcript. The z-index keeps later messages from
// painting over a sticky notice as they scroll past it.
const styles = stylex.create({
  sticky: {
    position: "sticky",
    top: spacingVars["--spacing-1"],
    zIndex: 10,
  },
});

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

// The sticky error/warning strips pinned to the top of the transcript:
// provider error, failed ACP session restore, and the "this agent can't
// resume history" heads-up. Top-level-conversation-only — a sub-agent's
// transcript never renders any of them.
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
          xstyle={styles.sticky}
        />
      )}
      {acpRestoreFailed && (
        <Banner
          status="error"
          role="alert"
          title="Couldn't restore the previous session"
          description={`${acpRestoreFailed}. This agent no longer remembers this conversation.`}
          endContent={
            <Button size="sm" variant="outline" onClick={onRetryAcpSession}>
              Start new session
            </Button>
          }
          collapsible={false}
          xstyle={styles.sticky}
        />
      )}
      {acpHistoryTruncated && (
        <Banner
          status="warning"
          title="Earlier history not shared"
          description={`${acpAgentLabel ?? "This agent"} doesn't support resuming a previous session, so this conversation's earlier history won't be visible to it.`}
          collapsible={false}
          xstyle={styles.sticky}
        />
      )}
    </>
  );
}
