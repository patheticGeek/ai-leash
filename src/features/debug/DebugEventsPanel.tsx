import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import * as stylex from "@stylexjs/stylex";
import { Activity, MoveDiagonal2, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useConversations } from "@/data/conversations";
import { PanelEmptyState } from "@/features/sidebar/tabs/PanelListState";
import { JsonViewer } from "@/ui/json-viewer";
import { type AcpDebugEvent, useAppStore } from "../../store";

const ALL_CONVERSATIONS = "__all__";

const styles = stylex.create({
  dragHandle: {
    cursor: { default: "grab", ":active": "grabbing" },
    userSelect: "none",
  },
  resizeHandle: {
    position: "absolute",
    insetInlineEnd: 0,
    insetBlockEnd: 0,
    cursor: "nwse-resize",
  },
  // Takes the room left under the header and filter, and scrolls in it.
  body: {
    flexGrow: 1,
    minHeight: 0,
  },
  payload: {
    overflowX: "auto",
  },
});

/**
 * The devtools-style global ACP event inspector. Shows every event captured
 * app-wide since debug mode was last enabled (see `useDebugEventCapture`),
 * filterable to one conversation. Purely a view over `debugEvents` — this
 * component holds no state of its own besides the filter, so closing and
 * reopening it (toggled via `debugPanelOpen`) never loses anything; only
 * turning debug mode off does.
 *
 * Built like the side panel's record lists: a compact `List` of events, and
 * the shared compact `EmptyState` when there are none.
 */
export default function DebugEventsPanel({
  onClose,
  onDragStart,
  onResizeStart,
}: {
  onClose: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  const events = useAppStore((s) => s.debugEvents);
  const clearDebugEvents = useAppStore((s) => s.clearDebugEvents);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const conversations = useConversations();
  const [filter, setFilter] = useState<string>(ALL_CONVERSATIONS);

  const conversationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of events) ids.add(item.sessionId);
    return Array.from(ids);
  }, [events]);

  const filtered =
    filter === ALL_CONVERSATIONS
      ? events
      : events.filter((e) => e.sessionId === filter);

  function labelFor(id: string) {
    const title = conversations.find((c) => c.id === id)?.title;
    const base = title ?? `${id.slice(0, 8)}…`;
    return id === activeSessionId ? `${base} (active)` : base;
  }

  return (
    <Card padding={0} elevation="high" height="100%">
      <VStack height="100%">
        <HStack padding={3} gap={2} vAlign="center" justify="between">
          {/* Mouse-only drag affordance — the panel is still fully usable (open/close/
              filter/clear) without ever moving it, so there's no keyboard
              equivalent to wire up here. */}
          <VStack
            gap={0.5}
            xstyle={styles.dragHandle}
            onMouseDown={onDragStart}
          >
            <Text type="label">ACP Events</Text>
            <Text type="supporting" color="secondary">
              Live only, app-wide — cleared when debug mode is turned off.
            </Text>
          </VStack>
          <HStack gap={1} vAlign="center">
            <IconButton
              variant="ghost"
              size="sm"
              label="Clear events"
              tooltip="Clear events"
              icon={<Icon icon={Trash2} size="sm" />}
              onClick={clearDebugEvents}
            />
            <IconButton
              variant="ghost"
              size="sm"
              label="Close panel"
              tooltip="Close panel"
              icon={<Icon icon={X} size="sm" />}
              onClick={onClose}
            />
          </HStack>
        </HStack>
        <Divider />
        <VStack padding={3}>
          {/* Astryx opens its option list in the top layer, so it paints
              above this fixed panel (see `DebugDevtoolsOverlay`) without a
              z-index of its own. */}
          <Selector
            label="Conversation"
            isLabelHidden
            size="sm"
            width="100%"
            value={filter}
            onChange={setFilter}
            options={[
              { value: ALL_CONVERSATIONS, label: "All conversations" },
              ...conversationIds.map((id) => ({
                value: id,
                label: labelFor(id),
              })),
            ]}
          />
        </VStack>
        <Divider />
        <VStack isScrollable xstyle={styles.body}>
          {filtered.length === 0 ? (
            <PanelEmptyState
              icon={Activity}
              title="No ACP events yet"
              description="Events sent to and received from ACP agents show up here as they happen."
            />
          ) : (
            <DebugEventsList events={filtered} />
          )}
        </VStack>
      </VStack>
      {/* Mouse-only resize affordance, same reasoning as the drag handle above —
          the panel's default size is always usable without it. */}
      <VStack
        padding={1}
        xstyle={styles.resizeHandle}
        onMouseDown={onResizeStart}
      >
        <Icon icon={MoveDiagonal2} size="sm" color="secondary" />
      </VStack>
    </Card>
  );
}

function DebugEventsList({ events }: { events: AcpDebugEvent[] }) {
  return (
    <List density="compact" hasDividers edge="padded">
      {events.map((item) => {
        const received = item.direction === "received";
        return (
          <ListItem
            key={item.id}
            align="first-line"
            startContent={
              <StatusDot
                variant={received ? "accent" : "warning"}
                label={item.direction}
                tooltip={item.direction}
              />
            }
            label={item.event}
            description={
              <VStack gap={1}>
                <Text type="supporting" color="secondary" maxLines={1}>
                  {item.direction} · conversation {item.sessionId}
                </Text>
                <VStack xstyle={styles.payload}>
                  <JsonViewer data={item.payload} defaultCollapseDepth={1} />
                </VStack>
              </VStack>
            }
            endContent={
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {new Date(item.receivedAt).toLocaleTimeString()}
              </Text>
            }
          />
        );
      })}
    </List>
  );
}
