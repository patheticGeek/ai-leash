import { Folder } from "lucide-react";
import type { RefObject } from "react";
import type { MentionCandidate } from "../../../../lib/tauriApi";
import { fileIcon } from "../../../tabs/fileIcon";
import ComposerMenu, { MenuRow } from "./ComposerMenu";

// The `@` file picker anchored above the chat input — the slash menu's
// twin (`SlashCommandMenu`), in the same palette row style (`ComposerMenu`),
// and presentational the same way: what matches, the highlight and the keys
// live in `useMentionPicker`, focus stays in the textarea. Each row is the
// file's tab icon (`fileIcon`; a folder for a directory), its name, then its
// folder muted and truncating. The search runs in the backend and returns
// paths only, so there are no match positions to mark.
export default function MentionMenu({
  matches,
  activeIndex,
  onSelect,
  onActiveIndexChange,
  anchorRef,
}: {
  matches: MentionCandidate[];
  activeIndex: number;
  onSelect: (candidate: MentionCandidate) => void;
  onActiveIndexChange: (index: number) => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  return (
    <ComposerMenu
      anchorRef={anchorRef}
      label="Mention a file"
      items={matches}
      activeIndex={activeIndex}
      getKey={(c) => c.path}
      onSelect={onSelect}
      onActiveIndexChange={onActiveIndexChange}
      emptyText="No matching files."
      renderRow={(c) => {
        const cut = c.path.lastIndexOf("/");
        const name = cut >= 0 ? c.path.slice(cut + 1) : c.path;
        const dir = cut >= 0 ? c.path.slice(0, cut) : "";
        return (
          <MenuRow
            icon={c.isDir ? Folder : fileIcon(c.path)}
            label={c.isDir ? `${name}/` : name}
            detail={dir || undefined}
          />
        );
      }}
    />
  );
}
