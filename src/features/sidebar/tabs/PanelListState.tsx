import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon, type IconType } from "@astryxdesign/core/Icon";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { RotateCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

// The empty / loading / error states shared by the side panel's record
// lists (Sub agents, Actions) — `prototype/PROPOSAL.md` §2.8: a compact
// `EmptyState` in the panel, `Skeleton` rows in the list's own shape, and
// errors that say what failed and offer Try again.

/** Loading rows: Skeletons in the shape of a compact ListItem. */
export function SkeletonRows() {
  return (
    <VStack gap={4} padding={4}>
      {[0, 1, 2].map((i) => (
        <HStack key={i} gap={3} vAlign="center">
          <Skeleton width={8} height={8} radius="rounded" index={i} />
          <VStack gap={1.5}>
            <Skeleton width={220} height={12} index={i} />
            <Skeleton width={160} height={10} index={i} />
          </VStack>
        </HStack>
      ))}
    </VStack>
  );
}

export function PanelEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconType;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <VStack padding={6}>
      <EmptyState
        isCompact
        icon={<Icon icon={icon} size="lg" color="secondary" />}
        title={title}
        description={description}
        actions={action}
      />
    </VStack>
  );
}

export function PanelErrorState({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <VStack padding={6}>
      <EmptyState
        isCompact
        icon={<Icon icon={TriangleAlert} size="lg" color="error" />}
        title={title}
        description={error instanceof Error ? error.message : String(error)}
        actions={
          <Button
            label="Try again"
            size="sm"
            icon={<Icon icon={RotateCw} size="sm" />}
            onClick={onRetry}
          />
        }
      />
    </VStack>
  );
}
