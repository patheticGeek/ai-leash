import { useEffect, useRef, useState } from "react";

const COPIED_MS = 1200;

// Copies text to the clipboard and reports it as "copied" for a moment
// afterwards, for a Copy button to flip to a check. Pass a `key` to `copy`
// when one hook serves many buttons (e.g. one per transcript row) —
// `copiedKey` says which was pressed last; without one, `copied` is enough.
export function useCopyToClipboard<K = true>() {
  const [copiedKey, setCopiedKey] = useState<K | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Don't fire the reset into an unmounted component.
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(text: string, key: K = true as K) {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiedKey(null), COPIED_MS);
  }

  return { copy, copied: copiedKey !== null, copiedKey };
}
