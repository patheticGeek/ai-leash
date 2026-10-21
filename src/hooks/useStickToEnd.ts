import { useCallback, useLayoutEffect, useRef } from "react";

// How close (px) to the bottom still counts as "at the end".
const END_THRESHOLD = 8;
// How long after a wheel/key/touch a scroll-up is still attributed to the
// user — long enough to cover the first scroll event of a smooth wheel step.
const INTENT_MS = 300;
const UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

// Keeps a scroll container pinned to its end while its content grows, until
// the user scrolls up; scrolling back down to the end pins it again. Returns
// refs for the scrolling viewport and its content, plus `stick()` to re-pin
// and jump to the end (sending a message, the "Latest" button).
//
// Replaces the message scroller's own `autoScroll`, which stops following on
// *any* wheel/touch/scroll key — wheeling inside a nested scroller (a tool
// output box, a wide code block) or wheeling down while already at the end —
// and only re-pins on a scroll event that happens to land at the end, so a
// growing transcript would slip out from under it. Here only an actual
// upward move of the viewport made by the user unpins, and following happens
// in a `ResizeObserver` callback (after layout, before paint) so there's no
// one-frame lag behind each streamed chunk.
export function useStickToEnd<
  V extends HTMLElement = HTMLDivElement,
  C extends HTMLElement = HTMLDivElement,
>() {
  const viewportRef = useRef<V>(null);
  const contentRef = useRef<C>(null);
  const stuck = useRef(true);

  const stick = useCallback(() => {
    stuck.current = true;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    let lastTop = viewport.scrollTop;
    let intentUntil = 0;
    let pointerHeld = false;
    let catchUp = 0;
    // While the user is mid-gesture, don't yank the view back to the end
    // before their scroll-up has had a chance to register as one.
    const userScrolling = () => pointerHeld || performance.now() < intentUntil;
    const follow = () => {
      if (stuck.current && !userScrolling()) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    };
    // A resize skipped mid-gesture is caught up on once the gesture ends,
    // in case it was the last one (the reply finished meanwhile).
    const markIntent = () => {
      intentUntil = performance.now() + INTENT_MS;
      window.clearTimeout(catchUp);
      catchUp = window.setTimeout(follow, INTENT_MS + 16);
    };

    const onScroll = () => {
      const top = viewport.scrollTop;
      const distance = viewport.scrollHeight - viewport.clientHeight - top;
      if (distance <= END_THRESHOLD) stuck.current = true;
      // A scroll-up with no user input behind it is the browser clamping
      // after content shrank — not a reason to stop following.
      else if (top < lastTop && userScrolling()) stuck.current = false;
      lastTop = top;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) markIntent();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (UP_KEYS.has(e.key) || (e.key === " " && e.shiftKey)) markIntent();
    };
    // Scrollbar drags and text-selection auto-scroll.
    const onPointerDown = () => {
      pointerHeld = true;
    };
    const onPointerUp = () => {
      if (!pointerHeld) return;
      pointerHeld = false;
      follow();
    };
    const observer = new ResizeObserver(follow);
    observer.observe(viewport);
    observer.observe(content);

    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("touchmove", markIntent, { passive: true });
    viewport.addEventListener("keydown", onKeyDown);
    viewport.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      observer.disconnect();
      window.clearTimeout(catchUp);
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchmove", markIntent);
      viewport.removeEventListener("keydown", onKeyDown);
      viewport.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  return { viewportRef, contentRef, stick };
}
