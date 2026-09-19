import { useEffect, useState } from "react";
import type { AcpCommandInfo } from "../../../lib/tauriApi";

// Slash-command autocomplete: only triggers when the *entire* input is "/"
// followed by a run of non-space characters — i.e. the user is still typing
// the command name itself. Typing a space (moving on to args) or anything
// else drops out of match automatically, no explicit "close" needed for that
// case.
export function useSlashCommands(input: string, commands: AcpCommandInfo[]) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  const query = /^\/(\S*)$/.exec(input)?.[1] ?? null;
  const matches =
    query !== null
      ? commands.filter((c) =>
          c.name.toLowerCase().startsWith(query.toLowerCase()),
        )
      : [];
  const showPopover = matches.length > 0 && dismissed !== query;
  const activeIndex = Math.min(index, matches.length - 1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: query is a trigger-only dep — reset the highlighted index whenever the typed query changes, its value isn't read in the body
  useEffect(() => {
    setIndex(0);
  }, [query]);

  return {
    matches,
    showPopover,
    activeIndex,
    setActiveIndex: setIndex,
    moveDown: () => setIndex((i) => Math.min(i + 1, matches.length - 1)),
    moveUp: () => setIndex((i) => Math.max(i - 1, 0)),
    /** Hide the popover until the typed query changes. */
    dismiss: () => setDismissed(query),
    /** Forget a previous dismissal (the command list itself went stale). */
    resetDismissed: () => setDismissed(null),
  };
}
