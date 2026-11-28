import {
  Bot,
  CircleHelp,
  Eraser,
  type LucideIcon,
  Shrink,
  SquareSlash,
} from "lucide-react";
import type { RefObject } from "react";
import type { AcpCommandInfo } from "../../../../lib/tauriApi";
import { COMPACT_COMMAND, LOCAL_COMMANDS } from "../../hooks/useChatSession";
import ComposerMenu, { MenuRow } from "./ComposerMenu";

export interface SlashCommandMenuProps {
  matches: AcpCommandInfo[];
  activeIndex: number;
  onSelect: (command: AcpCommandInfo) => void;
  onActiveIndexChange: (index: number) => void;
  // The chat input box the list opens above (it's a popover, not part of it).
  anchorRef: RefObject<HTMLElement | null>;
}

// The app's own commands' icons; an agent's commands all get the slash.
const LOCAL_ICONS: Record<string, LucideIcon> = {
  clear: Eraser,
  model: Bot,
  help: CircleHelp,
  compact: Shrink,
};

/** Whether `c` is one of the app's own commands rather than the agent's. */
export function isLocalCommand(c: AcpCommandInfo): boolean {
  return LOCAL_COMMANDS.includes(c) || c === COMPACT_COMMAND;
}

/** A command's row icon, here and in the "/help" banner. */
export function commandIcon(c: AcpCommandInfo): LucideIcon {
  return (isLocalCommand(c) && LOCAL_ICONS[c.name]) || SquareSlash;
}

// The "/" autocomplete list anchored above the chat input, in the command
// palette's row style (`ComposerMenu`): the app's commands, then the
// agent's, each `/name`, its description muted, its argument hint at the
// end. Presentational — which commands match what's typed, the highlighted
// index, and the dismissed-until-query-changes bookkeeping all live in
// `useSlashCommands.ts` (driven from `ChatComposer.tsx`), since the same
// keydown handler that drives this list's arrow-key/Tab/Escape navigation
// also has to fall through to "send the message" on a plain Enter — splitting
// that one handler across a component boundary risked subtly changing which
// key press wins. Focus therefore never leaves the textarea.
export default function SlashCommandMenu({
  matches,
  activeIndex,
  onSelect,
  onActiveIndexChange,
  anchorRef,
}: SlashCommandMenuProps) {
  return (
    <ComposerMenu
      anchorRef={anchorRef}
      label="Slash commands"
      items={matches}
      activeIndex={activeIndex}
      getKey={(c) => c.name}
      getGroup={(c) => (isLocalCommand(c) ? "Built-in" : "Agent")}
      onSelect={onSelect}
      onActiveIndexChange={onActiveIndexChange}
      emptyText="No matching commands."
      renderRow={(c) => (
        <MenuRow
          icon={commandIcon(c)}
          label={`/${c.name}`}
          detail={c.description || undefined}
          end={c.hint ?? undefined}
        />
      )}
    />
  );
}
