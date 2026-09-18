import { ArrowDown } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface MessageScrollerProps {
  children: ReactNode;
  /** Changes whenever new content arrives — sticks to the bottom if the user hasn't scrolled away. */
  scrollKey: unknown;
  /** Distance from the bottom (px) still counted as "at the bottom". */
  threshold?: number;
  /** Classes for the scroll container. */
  className?: string;
  /** Classes for the wrapper around `children` (width limit, padding, spacing). */
  contentClassName?: string;
}

// A transcript-style scroll area: follows new content while the user is
// parked at the bottom, stops following as soon as they scroll up to read,
// and offers a "Latest" button to jump back down.
function MessageScroller({
  children,
  scrollKey,
  threshold = 40,
  className,
  contentClassName,
}: MessageScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollKey is a trigger-only dep — re-run the follow check whenever content changes, its value isn't read in the body
  useEffect(() => {
    if (followRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [scrollKey]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    followRef.current = distance < threshold;
    setAtBottom(followRef.current);
  }

  function jumpToLatest() {
    followRef.current = true;
    setAtBottom(true);
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }

  return (
    <div data-slot="message-scroller" className="relative h-full">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cn("h-full overflow-y-auto flex flex-col", className)}
      >
        <div className={contentClassName}>{children}</div>
      </div>
      {!atBottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            variant="chip"
            bordered
            size="sm"
            onClick={jumpToLatest}
            className="pointer-events-auto bg-card"
          >
            <ArrowDown />
            Latest
          </Button>
        </div>
      )}
    </div>
  );
}

export { MessageScroller };
