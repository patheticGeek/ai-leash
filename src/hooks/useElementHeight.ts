import { useEffect, useLayoutEffect, useRef } from "react";

// Reports an element's rendered height — once on mount, then whenever it
// changes (content growing, a banner appearing, …) — through `onChange`.
// Returns the ref to put on the element. A callback rather than state so the
// component that owns the element doesn't re-render just to measure itself;
// only whoever consumes the number does.
export function useElementHeight<T extends HTMLElement>(
  onChange: (height: number) => void,
) {
  const ref = useRef<T>(null);
  // Always call the latest `onChange` without re-subscribing the observer
  // every time the caller passes a fresh function.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // A layout effect, measuring once up front rather than waiting on the
  // observer's first callback: whatever `onChange` lays out then lands in the
  // same frame as the element itself, not one painted frame later.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    onChangeRef.current(el.getBoundingClientRect().height);
    const observer = new ResizeObserver(() => {
      onChangeRef.current(el.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
