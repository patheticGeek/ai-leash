import { VStack } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import * as stylex from "@stylexjs/stylex";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";

const styles = stylex.create({
  list: { maxHeight: "20rem" },
});

// One selectable row. `render` draws it (a `DeletableRow`), told whether
// it's the keyboard-highlighted one.
export interface PickerRow {
  key: string;
  // What the search query is matched against — not necessarily the label
  // (see `WorktreePicker`, which also searches the checked-out branch name).
  searchText: string;
  isDisabled?: boolean;
  onSelect: () => void;
  render: (row: {
    isHighlighted: boolean;
    onHighlight: () => void;
    // Spread on the row's `ListItem`, so the highlight can be scrolled to.
    indexProps: { "data-picker-index": number };
  }) => ReactNode;
}

// The searchable list view shared by both checkout pickers, with an optional
// pinned "New …" row (omit `createLabel` for a read-only list). Focus stays
// in the search box: ArrowUp/ArrowDown move the highlight and Enter picks
// the highlighted row.
export default function PickerList({
  searchPlaceholder,
  createLabel,
  onCreate,
  rows,
  footer,
}: {
  searchPlaceholder: string;
  createLabel?: string;
  onCreate: () => void;
  rows: PickerRow[];
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLElement>(null);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? rows.filter((r) => r.searchText.toLowerCase().includes(needle))
    : rows;
  // The create row is always shown, first.
  const entries: { key: string; isDisabled?: boolean; onSelect: () => void }[] =
    [
      ...(createLabel ? [{ key: "\0create", onSelect: onCreate }] : []),
      ...matches,
    ];
  const active = Math.min(highlighted, entries.length - 1);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-picker-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (entries.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlighted((active + step + entries.length) % entries.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = entries[active];
      if (entry && !entry.isDisabled) entry.onSelect();
    }
  }

  const offset = createLabel ? 1 : 0;
  return (
    <VStack>
      <VStack padding={1}>
        <TextInput
          label={searchPlaceholder}
          isLabelHidden
          size="sm"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(value) => {
            setQuery(value);
            setHighlighted(0);
          }}
          onKeyDown={onKeyDown}
        />
      </VStack>
      <VStack ref={listRef} isScrollable xstyle={styles.list} paddingInline={1}>
        <List density="compact">
          {createLabel && (
            <ListItem
              data-picker-index={0}
              label={createLabel}
              isSelected={active === 0}
              onMouseEnter={() => setHighlighted(0)}
              onClick={onCreate}
            />
          )}
          {matches.map((row, i) => (
            <Fragment key={row.key}>
              {row.render({
                isHighlighted: active === i + offset,
                onHighlight: () => setHighlighted(i + offset),
                indexProps: { "data-picker-index": i + offset },
              })}
            </Fragment>
          ))}
        </List>
        {matches.length === 0 && (
          <VStack paddingInline={2} paddingBlock={3}>
            <Text type="supporting" color="secondary">
              No matches.
            </Text>
          </VStack>
        )}
        {footer}
      </VStack>
    </VStack>
  );
}
