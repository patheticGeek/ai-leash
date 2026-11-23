// The tab strip on top of a pane (the centre pane and the tool panel). It
// copies the ide template's drawer tabs — TabList size sm, no divider of its
// own, spacing-2 above — and adds the tool panel's "+" picker at the end.
// Both panes use this one component so their strips share a height and line.
//
// Closing a tab: a Tab is a <button>, so a close IconButton can't go in its
// endContent (a button inside a button is invalid and React refuses it).
// Instead the × is part of the tab itself, like a browser tab: a plain icon in
// endContent, shown on hover / keyboard focus and always on the selected tab.
// (useContainerReveal can't be used here: its container props replace the
// Tab's own class and the selected underline disappears.) Clicking the
// × closes the tab (the Tab's onClick sees the click landed on it); so does
// middle-click anywhere on the tab, and Delete or Ctrl+W on a focused tab —
// the keyboard path, announced through aria-keyshortcuts.
import { useState, type ReactNode } from "react";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import * as stylex from "@stylexjs/stylex";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

const styles = stylex.create({
  // Keep the ×'s box so tabs don't shift when it appears.
  hidden: { visibility: "hidden" },
});

export interface PaneTab {
  value: string;
  label: string;
  icon?: ReactNode;
  /** The pane's own home tab (Agent, Files…) can't be closed. */
  isClosable?: boolean;
}

function ClosableTab({ tab, isSelected, onClose }: { tab: PaneTab; isSelected: boolean; onClose: () => void }) {
  const [isHot, setIsHot] = useState(false);
  const isShown = isSelected || isHot;
  return (
    <Tab
      onPointerEnter={() => setIsHot(true)}
      onPointerLeave={() => setIsHot(false)}
      onFocus={() => setIsHot(true)}
      onBlur={() => setIsHot(false)}
      value={tab.value}
      label={tab.label}
      icon={tab.icon}
      aria-keyshortcuts="Delete Control+W"
      endContent={
        <HStack as="span" data-tab-close="" aria-hidden xstyle={isShown ? undefined : styles.hidden}>
          <Icon icon={XMarkIcon} size="sm" color="secondary" />
        </HStack>
      }
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-tab-close]")) {
          e.stopPropagation();
          onClose();
        }
      }}
      onAuxClick={(e) => {
        if (e.button === 1) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Delete" || (e.ctrlKey && e.key === "w")) {
          e.preventDefault();
          onClose();
        }
      }}
    />
  );
}

export default function PaneTabs({
  label,
  tabs: initialTabs,
  value,
  onChange,
  hasPicker,
}: {
  label: string;
  tabs: PaneTab[];
  value: string;
  onChange: (value: string) => void;
  hasPicker?: boolean;
}) {
  const [tabs, setTabs] = useState(initialTabs);
  const close = (v: string) => {
    setTabs((prev) => prev.filter((t) => t.value !== v));
    if (v === value) onChange(tabs[0].value);
  };
  return (
    <VStack gap={0}>
      <HStack gap={1} vAlign="center" paddingInline={3} paddingBlockStart={2}>
        <StackItem size="fill">
          <TabList aria-label={label} value={value} onChange={onChange} size="sm">
            {tabs.map((t) =>
              t.isClosable ? (
                <ClosableTab key={t.value} tab={t} isSelected={t.value === value} onClose={() => close(t.value)} />
              ) : (
                <Tab key={t.value} value={t.value} label={t.label} icon={t.icon} />
              ),
            )}
          </TabList>
        </StackItem>
        {hasPicker && (
          <IconButton
            variant="ghost"
            size="sm"
            label="Open a tab"
            tooltip="Open a tab"
            icon={<Icon icon={PlusIcon} size="sm" />}
          />
        )}
      </HStack>
      <Divider />
    </VStack>
  );
}
