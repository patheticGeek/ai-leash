import { useEffect, useRef } from "react";

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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      onChangeRef.current(el.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
