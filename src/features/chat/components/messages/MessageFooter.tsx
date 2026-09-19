import { Check, Copy, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { formatDuration, formatTime } from "../../format";

interface MessageFooterProps {
  isUser: boolean;
  time: number;
  copied: boolean;
  onCopy: () => void;
  showRetry: boolean;
  onRetry: () => void;
  /** "Worked for <time>" — assistant replies only. */
  turnDuration: number | undefined;
}

// The hover-revealed row under a text message: copy, optional retry, the
// timestamp and, for a finished assistant reply, how long the turn took.
export default function MessageFooter({
  isUser,
  time,
  copied,
  onCopy,
  showRetry,
  onRetry,
  turnDuration,
}: MessageFooterProps) {
  return (
    <div
      className={cn(
        "mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out w-full flex items-center gap-2 mb-0.5 text-xs uppercase tracking-wide text-zinc-600",
        isUser ? "flex-row-reverse" : "",
      )}
    >
      <Button variant="quiet" size="icon-sm" onClick={onCopy} title="Copy">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </Button>
      {showRetry && (
        <Button variant="quiet" size="icon-sm" onClick={onRetry} title="Retry">
          <RotateCcw size={13} />
        </Button>
      )}
      <div className="normal-case tracking-normal text-zinc-700 gap-2 flex items-center">
        <span>{formatTime(time)}</span>
        {turnDuration !== undefined && (
          <>
            <span>·</span>
            <span className="normal-case tracking-normal text-zinc-700">
              Worked for {formatDuration(turnDuration)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
