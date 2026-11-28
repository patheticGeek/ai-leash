import { type RefObject, useEffect } from "react";
import { useAppStore } from "../../../store";

// How long to keep trying, in frames: a modal dialog (the command palette,
// after "Focus message box") leaves the page inert until its exit motion
// ends and it closes, so a focus before then doesn't take.
const MAX_FRAMES = 60;

// Focuses the message box whenever `requestComposerFocus` is called (the
// `/` shortcut, the palette command). Retries each frame until the focus
// sticks; once it has, the closing dialog sees focus isn't stranded and
// leaves it where it is.
export function useComposerFocusRequest(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
) {
  useEffect(() => {
    let frame = 0;
    const unsubscribe = useAppStore.subscribe((s, prev) => {
      if (s.composerFocusRequest === prev.composerFocusRequest) return;
      cancelAnimationFrame(frame);
      const attempt = (tries: number) => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        if (el.ownerDocument.activeElement === el) return;
        if (tries + 1 < MAX_FRAMES) {
          frame = requestAnimationFrame(() => attempt(tries + 1));
        }
      };
      attempt(0);
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [textareaRef]);
}
