import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { VStack } from "@astryxdesign/core/Layout";
import { List } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import * as stylex from "@stylexjs/stylex";
import { Plus, Search } from "lucide-react";
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
  // The checked-out one; the highlight starts on it.
  isCurrent?: boolean;
  isDisabled?: boolean;
  onSelect: () => void;
  render: (row: {
    isHighlighted: boolean;
    onHighlight: () => void;
    // Spread on the row, so the highlight can be scrolled to.
    indexProps: { "data-picker-index": number };
  }) => ReactNode;
}

// The list view shared by both checkout pickers: a search field, a compact
// `List` of rows, and a "New …" action at the foot (omit `createLabel` for a
// read-only list). Focus stays in the search box: ArrowUp/ArrowDown move the
// highlight and Enter picks the highlighted row.
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
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const listRef = useRef<HTMLElement>(null);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? rows.filter((r) => r.searchText.toLowerCase().includes(needle))
    : rows;
  const current = Math.max(
    0,
    matches.findIndex((r) => r.isCurrent),
  );
  const active = Math.min(highlighted ?? current, matches.length - 1);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-picker-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (matches.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlighted((active + step + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = matches[active];
      if (entry && !entry.isDisabled) entry.onSelect();
    }
  }

  return (
    <VStack gap={2}>
      <TextInput
        label={searchPlaceholder}
        isLabelHidden
        size="sm"
        startIcon={Search}
        placeholder={searchPlaceholder}
        value={query}
        onChange={(value) => {
          setQuery(value);
          setHighlighted(0);
        }}
        onKeyDown={onKeyDown}
        hasAutoFocus
      />
      <VStack ref={listRef} isScrollable xstyle={styles.list}>
        {matches.length > 0 ? (
          // padded: the check sits inset from the edge with an even gap to
          // the name.
          <List density="compact" edge="padded">
            {matches.map((row, i) => (
              <Fragment key={row.key}>
                {row.render({
                  isHighlighted: active === i,
                  onHighlight: () => setHighlighted(i),
                  indexProps: { "data-picker-index": i },
                })}
              </Fragment>
            ))}
          </List>
        ) : (
          <VStack paddingInline={2} paddingBlock={3}>
            <Text type="supporting" color="secondary">
              {rows.length === 0 ? "Nothing here yet." : "No matches."}
            </Text>
          </VStack>
        )}
      </VStack>
      {footer}
      {createLabel && (
        <>
          <Divider />
          <Button
            variant="ghost"
            size="sm"
            label={createLabel}
            icon={<Plus size={14} />}
            onClick={onCreate}
          />
        </>
      )}
    </VStack>
  );
}
