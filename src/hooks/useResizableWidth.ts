import { useCallback, useEffect, useState } from "react";

/**
 * Tracks a persisted pixel width that the user can drag-resize via a handle.
 * `direction` controls which way dragging grows the panel: 1 if the handle
 * sits on the panel's right edge (dragging right grows it), -1 if it sits on
 * the left edge (dragging left grows it).
 */
export function useResizableWidth(
  storageKey: string,
  defaultWidth: number,
  min: number,
  max: number,
  direction: 1 | -1 = 1,
) {
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(storageKey));
    return stored && stored >= min && stored <= max ? stored : defaultWidth;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      function onMouseMove(ev: MouseEvent) {
        const delta = (ev.clientX - startX) * direction;
        setWidth(Math.min(max, Math.max(min, startWidth + delta)));
      }
      function onMouseUp() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      }
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [width, min, max, direction],
  );

  // Keyboard equivalent of the drag handle, for the `role="separator"` in
  // ResizeHandle — left/right always maps to shrink/grow regardless of
  // which edge the handle sits on.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = 16;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setWidth((w) => Math.min(max, Math.max(min, w - step)));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setWidth((w) => Math.min(max, Math.max(min, w + step)));
      }
    },
    [min, max],
  );

  return [width, { onMouseDown, onKeyDown, min, max }] as const;
}
