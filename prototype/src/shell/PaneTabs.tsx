// The tab strip on top of a pane (the centre pane and the tool panel). It
// copies the ide template's drawer tabs — TabList size sm, no divider of its
// own, spacing-2 above — and adds the tool panel's "+" picker at the end.
// Both panes use this one component so their strips share a height and line.
import type { ReactNode } from "react";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { PlusIcon } from "@heroicons/react/24/outline";

export interface PaneTab {
  value: string;
  label: string;
  icon?: ReactNode;
}

export default function PaneTabs({
  label,
  tabs,
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
  return (
    <VStack gap={0}>
      <HStack gap={1} vAlign="center" paddingInline={3} paddingBlockStart={2}>
        <StackItem size="fill">
          <TabList aria-label={label} value={value} onChange={onChange} size="sm">
            {tabs.map((t) => (
              <Tab key={t.value} value={t.value} label={t.label} icon={t.icon} />
            ))}
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
