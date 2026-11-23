import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";
import { MessagesSquare, RotateCcw, TriangleAlert } from "lucide-react";

type TranscriptStateProps =
  | { state: "empty" | "loading" }
  | { state: "error"; error: string; onRetry: () => void };

// What the transcript shows instead of messages: an empty conversation
// (e.g. right after `/clear`), the saved history still loading (skeletons
// in the transcript's own shapes — a user bubble on the end, reply prose
// across the column, a tool row), or that history failing to load, with
// Try again.
export default function TranscriptState(props: TranscriptStateProps) {
  if (props.state === "loading") {
    return (
      <VStack gap={8} paddingBlock={6} aria-busy="true" aria-label="Loading">
        <HStack hAlign="end">
          <Skeleton width={360} height={56} radius={4} />
        </HStack>
        <VStack gap={2}>
          <Skeleton width="92%" height={14} index={1} />
          <Skeleton width="84%" height={14} index={2} />
          <Skeleton width="60%" height={14} index={3} />
        </VStack>
        <Skeleton width={280} height={12} index={4} />
        <HStack hAlign="end">
          <Skeleton width={240} height={40} radius={4} index={5} />
        </HStack>
        <VStack gap={2}>
          <Skeleton width="88%" height={14} index={6} />
          <Skeleton width="48%" height={14} index={7} />
        </VStack>
      </VStack>
    );
  }
  if (props.state === "error") {
    return (
      <EmptyState
        icon={<Icon icon={TriangleAlert} size="lg" color="error" />}
        title="Couldn't load this conversation"
        description={`${props.error}. Nothing was deleted.`}
        actions={
          <Button
            variant="primary"
            label="Try again"
            icon={<Icon icon={RotateCcw} size="sm" />}
            onClick={props.onRetry}
          />
        }
      />
    );
  }
  return (
    <EmptyState
      icon={<Icon icon={MessagesSquare} size="lg" color="secondary" />}
      title="No messages yet"
      description="Ask about your code, plan a change, or let the agent explore the project with you."
    />
  );
}
