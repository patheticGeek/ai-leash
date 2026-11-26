import { VStack } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import * as stylex from "@stylexjs/stylex";
import { FileText, Folder } from "lucide-react";
import { type RefObject, useEffect, useRef } from "react";
import type { MentionCandidate } from "../../../../lib/tauriApi";
import InputAnchoredPopover from "./InputAnchoredPopover";

const styles = stylex.create({
  list: { maxHeight: "14rem" },
});

// The `@` file picker anchored above the chat input — the slash menu's
// twin (`SlashCommandMenu`), and presentational the same way: what matches,
// the highlight and the keys live in `useMentionPicker`, focus stays in the
// textarea. Each row is the file or folder name with its directory under it.
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
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelectorAll("[data-mention-index]")
      [activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <InputAnchoredPopover anchorRef={anchorRef} label="Mention a file">
      <VStack
        ref={listRef}
        isScrollable
        xstyle={styles.list}
        onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
      >
        <List density="compact">
          {matches.map((c, i) => {
            const cut = c.path.lastIndexOf("/");
            const name = cut >= 0 ? c.path.slice(cut + 1) : c.path;
            const dir = cut >= 0 ? c.path.slice(0, cut) : "";
            return (
              <ListItem
                key={c.path}
                data-mention-index={i}
                isSelected={i === activeIndex}
                onMouseEnter={() => onActiveIndexChange(i)}
                onClick={() => onSelect(c)}
                startContent={
                  c.isDir ? <Folder size={14} /> : <FileText size={14} />
                }
                label={<Text>{c.isDir ? `${name}/` : name}</Text>}
                description={
                  dir ? (
                    <Text type="supporting" size="xsm" color="secondary">
                      {dir}
                    </Text>
                  ) : undefined
                }
              />
            );
          })}
        </List>
      </VStack>
    </InputAnchoredPopover>
  );
}
