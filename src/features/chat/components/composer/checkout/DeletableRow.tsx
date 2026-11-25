import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { useContainerReveal } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, Stack, VStack } from "@astryxdesign/core/Layout";
import { ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Check, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";

const styles = stylex.create({
  // Keeps the check's box on every row so labels line up.
  hidden: { visibility: "hidden" },
  noShrink: { flexShrink: 0 },
  // The sm IconButton is taller than a compact row's text line; pulled into
  // the row's own block padding so it never sets the row height.
  rowAction: { marginBlock: `calc(-1 * ${spacingVars["--spacing-1"]})` },
});

// A `PickerList` row: the current one checked, its trash revealed on hover
// or keyboard highlight (layout-preserving, so revealing it never changes
// the row's height). The trash swaps the row in place for a muted confirm
// card; if git refuses the plain delete (a dirty worktree, an unmerged
// branch) the card turns into the force-delete confirm with git's reason.
// Kept inline rather than an `AlertDialog` so the popover never grows a
// second, heavier modal layer.
export default function DeletableRow({
  label,
  description,
  active,
  isHighlighted,
  onHighlight,
  indexProps,
  deletable,
  selectDisabled,
  onSelect,
  onDelete,
}: {
  label: string;
  description?: string;
  active: boolean;
  isHighlighted: boolean;
  onHighlight: () => void;
  indexProps: { "data-picker-index": number };
  deletable: boolean;
  selectDisabled?: boolean;
  onSelect: () => void;
  onDelete: (force: boolean) => Promise<void>;
}) {
  const [phase, setPhase] = useState<
    "idle" | "confirm" | "deleting" | "error" | "forcing"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const { getContainerProps, getContentRevealProps } = useContainerReveal();

  async function runDelete(force: boolean) {
    setPhase(force ? "forcing" : "deleting");
    try {
      await onDelete(force);
      // Success removes this row from the parent's list; nothing left to do.
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  if (phase !== "idle") {
    const isForce = phase === "error" || phase === "forcing";
    const busy = phase === "deleting" || phase === "forcing";
    return (
      <Stack {...indexProps}>
        <Card variant="muted" padding={3}>
          <VStack gap={3}>
            <HStack gap={2} align="start">
              {isForce && (
                <HStack align="center" xstyle={styles.noShrink}>
                  <Icon icon={TriangleAlert} size="sm" color="warning" />
                </HStack>
              )}
              <VStack gap={0.5}>
                <Text weight="semibold">Delete {label}?</Text>
                <Text type="supporting" color="secondary">
                  {isForce
                    ? `${error ?? "Git refused the delete."} Force deleting throws its changes away.`
                    : "This can't be undone."}
                </Text>
              </VStack>
            </HStack>
            <HStack gap={1} justify="end">
              <Button
                variant="ghost"
                size="sm"
                label="Cancel"
                isDisabled={busy}
                onClick={() => setPhase("idle")}
              />
              <Button
                variant="destructive"
                size="sm"
                label={isForce ? "Force delete" : "Delete"}
                isLoading={busy}
                onClick={() => void runDelete(isForce)}
              />
            </HStack>
          </VStack>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack
      {...indexProps}
      {...getContainerProps({
        hoverDelay: 120,
        forceState: isHighlighted ? "active" : undefined,
      })}
      onMouseEnter={onHighlight}
    >
      <ListItem
        label={label}
        description={description}
        isSelected={isHighlighted}
        isDisabled={selectDisabled}
        onClick={onSelect}
        startContent={
          <HStack
            align="center"
            xstyle={[styles.noShrink, !active && styles.hidden]}
          >
            <Check size={14} aria-label={active ? "Current" : undefined} />
          </HStack>
        }
        endContent={
          deletable ? (
            <HStack {...getContentRevealProps({ isLayoutPreserved: true })}>
              <IconButton
                variant="ghost"
                size="sm"
                label={`Delete ${label}`}
                icon={<Trash2 size={14} />}
                xstyle={styles.rowAction}
                onClick={(e) => {
                  e.stopPropagation();
                  setPhase("confirm");
                }}
              />
            </HStack>
          ) : undefined
        }
      />
    </Stack>
  );
}
