import { Button } from "@astryxdesign/core/Button";
import {
  CommandPalette,
  CommandPaletteInput,
} from "@astryxdesign/core/CommandPalette";
import { VStack } from "@astryxdesign/core/Layout";
import { Popover } from "@astryxdesign/core/Popover";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import {
  createStaticSource,
  type SearchableItem,
} from "@astryxdesign/core/Typeahead";
import * as stylex from "@stylexjs/stylex";
import { Bot } from "lucide-react";
import { useMemo } from "react";

export interface PickerOption {
  key: string;
  label: string;
  subtitle: string;
  // Heading this row is grouped under — one per provider config/ACP agent
  // (e.g. "GitHub Copilot", listing that agent's own models beneath it),
  // not per backend kind, so two same-kind configs never get merged into
  // one ambiguous group.
  section: string;
}

interface ModelPickerPopoverProps {
  options: PickerOption[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  triggerLabel: string;
  // Renders the trigger as a danger chip with this as its title — used when
  // the active agent is turned off in Settings.
  dangerMessage?: string | null;
  disabled?: boolean;
  // Shows a spinner in place of the agent icon while a picked model waits
  // for the agent's connection to come up (`useChatSession`'s
  // `modelSwitchPending`).
  loading?: boolean;
  // Controlled from outside (rather than the plain internal toggle this
  // started with) so the "/model" local command can pop it open without a
  // real click — see `ChatComposer.tsx`'s `runLocalCommand`.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const styles = stylex.create({
  // A long "Agent · model" label truncates rather than crowding the footer.
  trigger: { maxWidth: "16rem" },
});

type ModelItem = SearchableItem<{ group: string; subtitle: string }>;

// A search-and-pick popover for choosing "which brain answers" — modeled
// visually on Claude Desktop's model switcher (search bar on top, a plain
// list of name+subtitle rows below, active row highlighted). We only needed
// the look, not its full feature set — no keyboard shortcuts, no favoriting,
// no category rail, just enough to replace the old plain <select>.
export default function ModelPickerPopover({
  options,
  activeKey,
  onSelect,
  triggerLabel,
  dangerMessage,
  disabled,
  loading,
  open,
  onOpenChange,
}: ModelPickerPopoverProps) {
  // Groups are already contiguous in `options` (built section-by-section
  // upstream in `useChatSession.ts`), and the palette groups by
  // `auxiliaryData.group` in first-seen order — so the original section
  // order is kept with no separate sort.
  const searchSource = useMemo(
    () =>
      createStaticSource<ModelItem>(
        options.map((o) => ({
          id: o.key,
          label: o.label,
          auxiliaryData: { group: o.section, subtitle: o.subtitle },
        })),
        {
          keywords: (item) => [
            item.auxiliaryData?.subtitle ?? "",
            item.auxiliaryData?.group ?? "",
          ],
        },
      ),
    [options],
  );

  return (
    <Popover
      isOpen={open}
      onOpenChange={onOpenChange}
      isEnabled={!disabled}
      label="Models"
      placement="above"
      alignment="start"
      width="18rem"
      padding={0}
      content={
        <CommandPalette
          isInline
          isOpen={open}
          onOpenChange={onOpenChange}
          label="Models"
          width="100%"
          maxHeight="24rem"
          searchSource={searchSource}
          value={activeKey ?? undefined}
          onValueChange={onSelect}
          // The popover moves focus into the input when it opens; the input
          // itself mustn't autofocus, as the closed popover stays mounted.
          input={
            <CommandPaletteInput
              placeholder="Search models..."
              hasAutoFocus={false}
            />
          }
          emptySearchText="No matches."
          renderItem={(item) => (
            <VStack gap={0.5}>
              <Text weight="medium">{item.label}</Text>
              <Text type="supporting" size="xsm" color="secondary">
                {item.auxiliaryData?.subtitle}
              </Text>
            </VStack>
          )}
        />
      }
    >
      <Button
        variant={dangerMessage ? "destructive" : "ghost"}
        size="sm"
        label={triggerLabel}
        icon={
          loading ? (
            <Spinner size="sm" aria-label="Connecting" />
          ) : (
            <Bot size={14} />
          )
        }
        tooltip={dangerMessage ?? undefined}
        isDisabled={disabled}
        xstyle={styles.trigger}
      />
    </Popover>
  );
}
