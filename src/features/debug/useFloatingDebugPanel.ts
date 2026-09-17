import { useCallback, useState } from "react";
import { TITLEBAR_HEIGHT } from "../../app/TitleBar";
import { LS_KEYS } from "../../lib/localStorageKeys";

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 480;
const MIN_WIDTH = 280;
const MAX_WIDTH = 900;
const MIN_HEIGHT = 200;
const EDGE_MARGIN = 16;

function readNumber(key: string, fallback: number): number {
  const stored = Number(localStorage.getItem(key));
  return Number.isFinite(stored) && stored > 0 ? stored : fallback;
}

function persist(width: number, height: number, x: number, y: number) {
  localStorage.setItem(LS_KEYS.debugPanelWidth, String(width));
  localStorage.setItem(LS_KEYS.debugPanelHeight, String(height));
  localStorage.setItem(LS_KEYS.debugPanelX, String(x));
  localStorage.setItem(LS_KEYS.debugPanelY, String(y));
}

/**
 * Persisted position + size for the free-floating ACP Events panel —
 * draggable by its header (`onDragStart`) and resizable from its
 * bottom-right corner (`onResizeStart`). Unlike `useResizableWidth` (the
 * app's docked left/right panels, which only ever resize width and stay
 * pinned to a screen edge), this panel can be moved and sized anywhere over
 * the rest of the app, so it tracks a full `{ x, y, width, height }` box
 * instead of just a width.
 *
 * Kept fully on-screen at all times (clamped against the current
 * `window.innerWidth`/`innerHeight` on every drag/resize step) — including
 * never above the title bar, whose drag region is otherwise reserved for
 * moving the OS window itself — so the panel's own header and resize handle
 * can never be dragged out of reach.
 */
export function useFloatingDebugPanel() {
  const [width, setWidth] = useState(() =>
    readNumber(LS_KEYS.debugPanelWidth, DEFAULT_WIDTH),
  );
  const [height, setHeight] = useState(() =>
    readNumber(LS_KEYS.debugPanelHeight, DEFAULT_HEIGHT),
  );
  const [pos, setPos] = useState(() => ({
    x: readNumber(
      LS_KEYS.debugPanelX,
      window.innerWidth - DEFAULT_WIDTH - EDGE_MARGIN,
    ),
    y: readNumber(LS_KEYS.debugPanelY, TITLEBAR_HEIGHT + EDGE_MARGIN),
  }));

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPos = pos;
      // Mirrors `setPos` while dragging so `onMouseUp` can persist the
      // final position without racing React's async state update.
      let latest = startPos;

      function onMouseMove(ev: MouseEvent) {
        latest = {
          x: Math.min(
            Math.max(0, startPos.x + (ev.clientX - startX)),
            window.innerWidth - width,
          ),
          y: Math.min(
            Math.max(TITLEBAR_HEIGHT, startPos.y + (ev.clientY - startY)),
            window.innerHeight - height,
          ),
        };
        setPos(latest);
      }
      function onMouseUp() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        persist(width, height, latest.x, latest.y);
      }
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [pos, width, height],
  );

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = width;
      const startHeight = height;
      const maxWidth = Math.min(MAX_WIDTH, window.innerWidth - pos.x);
      const maxHeight = window.innerHeight - pos.y;
      // Mirrors `setWidth`/`setHeight` while resizing — see `onDragStart`.
      let latestWidth = startWidth;
      let latestHeight = startHeight;

      function onMouseMove(ev: MouseEvent) {
        latestWidth = Math.min(
          maxWidth,
          Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX)),
        );
        latestHeight = Math.min(
          maxHeight,
          Math.max(MIN_HEIGHT, startHeight + (ev.clientY - startY)),
        );
        setWidth(latestWidth);
        setHeight(latestHeight);
      }
      function onMouseUp() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        persist(latestWidth, latestHeight, pos.x, pos.y);
      }
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [width, height, pos],
  );

  return { x: pos.x, y: pos.y, width, height, onDragStart, onResizeStart };
}
