import type { AcpCommandInfo } from "../../../../lib/tauriApi";
import ClaudeRateLimitBanner, {
  type ClaudeRateLimit,
} from "./ClaudeRateLimitBanner";
import HelpBanner from "./HelpBanner";
import SubAgentsPill from "./SubAgentsPill";
import TaskLinkBanner from "./TaskLinkBanner";
import TranscriptNotices, {
  type TranscriptNoticesProps,
} from "./TranscriptNotices";

export interface ChatBannersProps {
  sessionId: string | null;
  // The conversation's own notices; omitted for a chat without them.
  notices?: TranscriptNoticesProps;
  claudeRateLimit: ClaudeRateLimit | null;
  claudeAutoResumeArmed: boolean;
  onArmAutoResume: () => void;
  onDismissRateLimit: () => void;
  helpOpen: boolean;
  commands: AcpCommandInfo[];
  onCloseHelp: () => void;
}

// Every notice above the composer, in one stack ordered by severity, top to
// bottom: errors (provider error, failed restore), then warnings (history
// not shared, Claude's session limit), then info (task link, "/help"). The
// Banner's `status` is the severity: error = something broke, warning =
// needs a decision, info = state you can change. The theme backs banner
// frames with the solid card surface, so they read over the transcript.
// Last, docked right above the composer: the running sub-agents pill (#26).
export default function ChatBanners({
  sessionId,
  notices,
  claudeRateLimit,
  claudeAutoResumeArmed,
  onArmAutoResume,
  onDismissRateLimit,
  helpOpen,
  commands,
  onCloseHelp,
}: ChatBannersProps) {
  return (
    <>
      {notices && <TranscriptNotices {...notices} severity="error" />}
      {notices && <TranscriptNotices {...notices} severity="warning" />}
      {claudeRateLimit && (
        <ClaudeRateLimitBanner
          rateLimit={claudeRateLimit}
          autoResumeArmed={claudeAutoResumeArmed}
          onArmAutoResume={onArmAutoResume}
          onDismiss={onDismissRateLimit}
        />
      )}
      <TaskLinkBanner sessionId={sessionId} />
      {helpOpen && <HelpBanner commands={commands} onClose={onCloseHelp} />}
      <SubAgentsPill sessionId={sessionId} />
    </>
  );
}
