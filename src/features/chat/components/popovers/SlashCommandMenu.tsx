import { VStack } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import * as stylex from "@stylexjs/stylex";
import { type RefObject, useEffect, useRef } from "react";
import type { AcpCommandInfo } from "../../../../lib/tauriApi";
import InputAnchoredPopover from "./InputAnchoredPopover";

const styles = stylex.create({
  list: { maxHeight: "14rem" },
});

export interface SlashCommandMenuProps {
  matches: AcpCommandInfo[];
  activeIndex: number;
  onSelect: (command: AcpCommandInfo) => void;
  onActiveIndexChange: (index: number) => void;
  // The chat input box the list opens above (it's a popover, not part of it).
  anchorRef: RefObject<HTMLElement | null>;
}

// The "/" autocomplete list anchored above the chat input. Presentational —
// which commands match what's typed, the highlighted index, and the
// dismissed-until-query-changes bookkeeping all live in `useSlashCommands.ts`
// (driven from `ChatComposer.tsx`), since the same
// keydown handler that drives this list's arrow-key/Tab/Escape navigation
// also has to fall through to "send the message" on a plain Enter — splitting
// that one handler across a component boundary risked subtly changing which
// key press wins. Focus therefore never leaves the textarea: the popover
// doesn't take it on open, and mouse-down inside it is swallowed.
export default function SlashCommandMenu({
  matches,
  activeIndex,
  onSelect,
  onActiveIndexChange,
  anchorRef,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLElement>(null);
  // The highlight is driven from outside (the textarea's arrow keys), so
  // keep the active row in view here.
  useEffect(() => {
    listRef.current
      ?.querySelectorAll("[data-slash-index]")
      [activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <InputAnchoredPopover anchorRef={anchorRef} label="Slash commands">
      <VStack
        ref={listRef}
        isScrollable
        xstyle={styles.list}
        onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
      >
        <List density="compact">
          {matches.map((c, i) => (
            <ListItem
              key={c.name}
              data-slash-index={i}
              isSelected={i === activeIndex}
              onMouseEnter={() => onActiveIndexChange(i)}
              onClick={() => onSelect(c)}
              label={
                <>
                  <Text weight="medium">/{c.name}</Text>
                  {c.hint && (
                    <>
                      {" "}
                      <Text color="secondary">{c.hint}</Text>
                    </>
                  )}
                </>
              }
              description={
                <Text type="supporting" size="xsm" color="secondary">
                  {c.description}
                </Text>
              }
            />
          ))}
        </List>
      </VStack>
    </InputAnchoredPopover>
  );
}
