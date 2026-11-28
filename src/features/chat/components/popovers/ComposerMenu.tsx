import {
  CommandPaletteEmpty,
  CommandPaletteFooter,
  CommandPaletteGroup,
  CommandPaletteItem,
  CommandPaletteList,
} from "@astryxdesign/core/CommandPalette";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon, type IconType } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { Fragment, type ReactNode, type RefObject } from "react";
import InputAnchoredPopover from "./InputAnchoredPopover";

const styles = stylex.create({
  list: { maxHeight: "14rem" },
  // With secondary text after it, the label keeps its width up to a share
  // of the row and the secondary text takes (and truncates in) the rest;
  // alone, the label takes the row — as in the palette.
  label: { flexShrink: 0, maxWidth: "60%" },
  labelFill: { flex: 1, minWidth: 0 },
  detail: { flex: 1, minWidth: 0 },
  end: { flexShrink: 0 },
});

// One row's content, shared by the composer's menus and the "/help" banner
// — the command palette's row (`AppCommandPalette`'s `renderItem`): icon,
// label in primary text, muted secondary text, then an optional end slot
// (a hint or `Kbd`). `isWrapping` lets the secondary text wrap instead of
// truncating, for rows meant to be read (the help list).
export function MenuRow({
  icon,
  label,
  detail,
  end,
  isWrapping = false,
}: {
  icon: IconType;
  label: ReactNode;
  detail?: ReactNode;
  end?: ReactNode;
  isWrapping?: boolean;
}) {
  return (
    <HStack gap={2} align={isWrapping ? "start" : "center"} width="100%">
      <Icon icon={icon} size="sm" color="secondary" />
      <Text maxLines={1} xstyle={detail ? styles.label : styles.labelFill}>
        {label}
      </Text>
      {detail && (
        <Text
          type="supporting"
          size="xsm"
          color="secondary"
          maxLines={isWrapping ? 0 : 1}
          xstyle={styles.detail}
        >
          {detail}
        </Text>
      )}
      {end != null && (
        <Text
          type="supporting"
          size="xsm"
          color="secondary"
          maxLines={1}
          xstyle={styles.end}
        >
          {end}
        </Text>
      )}
    </HStack>
  );
}

// A consecutive run of rows under one group heading (or none).
interface Run {
  group: string | undefined;
  start: number;
  end: number;
}

// The frame of the composer's autocomplete menus (`/` commands, `@` files):
// the command palette's own parts, standalone, in the popover above the chat
// input (`InputAnchoredPopover`, the app's popover surface) — so the rows,
// their highlight, group headings, empty state and key-hint footer are the
// palette's. Presentational: the caller's hook owns what matches, the
// highlighted index and the keys, and focus never leaves the textarea (the
// popover doesn't take it, and mouse-down inside is swallowed). Groups are
// runs of consecutive rows with the same `getGroup`, so the highlight's
// index stays the row's index in `items`.
export default function ComposerMenu<T>({
  anchorRef,
  label,
  items,
  activeIndex,
  getKey,
  getGroup,
  renderRow,
  onSelect,
  onActiveIndexChange,
  emptyText,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  items: T[];
  activeIndex: number;
  getKey: (item: T) => string;
  getGroup?: (item: T) => string | undefined;
  renderRow: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  onActiveIndexChange: (index: number) => void;
  emptyText: string;
}) {
  // A standalone `CommandPaletteItem` scrolls itself into view when it
  // becomes the highlighted row, so the arrow keys keep it visible.
  const rows = items.map((item, i) => (
    <CommandPaletteItem
      key={getKey(item)}
      value={getKey(item)}
      isHighlighted={i === activeIndex}
      onMouseEnter={() => onActiveIndexChange(i)}
      onSelect={() => onSelect(item)}
    >
      {renderRow(item)}
    </CommandPaletteItem>
  ));
  const runs: Run[] = [];
  items.forEach((item, i) => {
    const group = getGroup?.(item);
    const last = runs[runs.length - 1];
    if (last && last.group === group) last.end = i + 1;
    else runs.push({ group, start: i, end: i + 1 });
  });

  return (
    <InputAnchoredPopover anchorRef={anchorRef} label={label}>
      <VStack>
        <CommandPaletteList
          label={label}
          xstyle={styles.list}
          onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
        >
          {items.length === 0 ? (
            <CommandPaletteEmpty>{emptyText}</CommandPaletteEmpty>
          ) : (
            runs.map((run) =>
              run.group ? (
                <CommandPaletteGroup key={run.start} heading={run.group}>
                  {rows.slice(run.start, run.end)}
                </CommandPaletteGroup>
              ) : (
                <Fragment key={run.start}>
                  {rows.slice(run.start, run.end)}
                </Fragment>
              ),
            )
          )}
        </CommandPaletteList>
        <Divider />
        <CommandPaletteFooter />
      </VStack>
    </InputAnchoredPopover>
  );
}
