import type { AcpCommandInfo } from "../../../../lib/tauriApi";
import ClaudeRateLimitBanner, {
  type ClaudeRateLimit,
} from "./ClaudeRateLimitBanner";
import HelpBanner from "./HelpBanner";
import QueuedMessagesBanner from "./QueuedMessageBanner";

interface ChatBannersProps {
  helpOpen: boolean;
  commands: AcpCommandInfo[];
  onCloseHelp: () => void;
  claudeRateLimit: ClaudeRateLimit | null;
  claudeAutoResumeArmed: boolean;
  onArmAutoResume: () => void;
  onDismissRateLimit: () => void;
  queuedMessages: string[];
  onCancelQueued: (index: number) => void;
}

// The strips stacked directly above the message box: the "/help" overlay,
// the Claude session-limit auto-resume notice, and the queued-messages list.
export default function ChatBanners({
  helpOpen,
  commands,
  onCloseHelp,
  claudeRateLimit,
  claudeAutoResumeArmed,
  onArmAutoResume,
  onDismissRateLimit,
  queuedMessages,
  onCancelQueued,
}: ChatBannersProps) {
  return (
    <>
      {helpOpen && <HelpBanner commands={commands} onClose={onCloseHelp} />}
      {claudeRateLimit && (
        <ClaudeRateLimitBanner
          rateLimit={claudeRateLimit}
          autoResumeArmed={claudeAutoResumeArmed}
          onArmAutoResume={onArmAutoResume}
          onDismiss={onDismissRateLimit}
        />
      )}
      {queuedMessages.length > 0 && (
        <QueuedMessagesBanner
          messages={queuedMessages}
          onCancel={onCancelQueued}
        />
      )}
    </>
  );
}
