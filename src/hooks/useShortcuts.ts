import { useEffect, useRef } from "react";
import {
  isMacPlatform,
  type ShortcutId,
  shortcutForEvent,
} from "../lib/shortcuts";

export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

// The one document keydown listener behind every global shortcut in
// `lib/shortcuts.ts`. Bubble phase, so a component that handles a key
// itself (Ctrl+W on a focused tab, Ctrl+S in the editor, a dialog) gets it
// first and can `preventDefault` it away from here. A shortcut with no
// handler right now (e.g. the side-panel ones on a board) is left alone.
export function useShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const isMac = isMacPlatform();
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat || e.isComposing) return;
      const shortcut = shortcutForEvent(e, isMac);
      const run = shortcut && ref.current[shortcut.id];
      if (!run) return;
      e.preventDefault();
      run();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
