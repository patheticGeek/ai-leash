import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { useAnnounce } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Heading, Text } from "@astryxdesign/core/Text";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  isTextEntryTarget,
  type PromptKeyAction,
  promptKeyAction,
  promptKeyTarget,
} from "../../../../lib/promptKeys";
import { useAppStore } from "../../../../store";

// How long a fresh prompt ignores Enter and the number keys. The prompt
// takes the message box's place, so an Enter meant for the message the user
// was typing could otherwise answer a request they haven't read. Escape (the
// safe answer) and stepping work at once.
const ARM_DELAY_MS = 400;

const styles = stylex.create({
  // Amber = waiting on the user (see the design guide's status colours).
  card: {
    borderColor: colorVars["--color-border-warning"],
    // Only ever focused from code (tabIndex -1), to take the prompt's keys;
    // the amber edge already marks it.
    outlineStyle: "none",
  },
});

export interface PromptQueue {
  // 0-based position of the prompt on screen.
  index: number;
  count: number;
  onStep: (delta: 1 | -1) => void;
}

// Sends focus back to the message box once a prompt's been answered and the
// composer is back in its place (the next frame). Nothing happens if another
// prompt took its place instead — that one focuses itself.
export function focusComposerAfterAnswer() {
  requestAnimationFrame(() => useAppStore.getState().requestComposerFocus());
}

// Focus is somewhere the user types, outside this card.
function isTypingElsewhere(card: HTMLElement): boolean {
  const active = card.ownerDocument.activeElement;
  if (!active || active === card.ownerDocument.body) return false;
  if (card.contains(active)) return false;
  return (
    isTextEntryTarget(promptKeyTarget(active)) ||
    active.closest(".xterm, .cm-editor") !== null
  );
}

// What a permission ask or an agent's question looks like: it takes the
// composer's place, on the composer's own card surface (`Card elevation=low`)
// with an amber edge and icon for "needs you" — Heading 4 title, a
// supporting subtitle, the content, then the actions end-aligned (secondary
// → primary), each with its `Kbd`. `ChatComposer` swaps it in.
//
// It owns the prompt keyboard (`lib/promptKeys.ts`): keys act only while
// focus is inside the card, so nothing the user types elsewhere is taken.
// When a prompt appears (a new `promptId`) the card focuses itself — unless
// the user is typing in another field, the terminal or the editor — and says
// what it's asking through the live region.
export default function PromptCard({
  promptId,
  icon,
  title,
  subtitle,
  headerEnd,
  children,
  actions,
  label,
  announcement,
  queue,
  optionCount,
  onKeyAction,
}: {
  // Changes when a different request is on screen: re-focus, re-announce,
  // re-arm.
  promptId: string;
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  // Beside the title, e.g. a dismiss button.
  headerEnd?: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
  label: string;
  // Read out when the prompt appears.
  announcement: string;
  queue?: PromptQueue;
  // How many numbered options the number keys pick from.
  optionCount: number;
  onKeyAction: (
    action: Exclude<PromptKeyAction, { type: "previous" | "next" }>,
  ) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const announce = useAnnounce({ hasReplace: true });

  const [armedId, setArmedId] = useState<string | null>(null);
  const isArmed = armedId === promptId;
  useEffect(() => {
    const timer = setTimeout(() => setArmedId(promptId), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [promptId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: promptId is a trigger-only dep — a new request on screen is focused and announced again
  useEffect(() => {
    announce(announcement);
    const card = cardRef.current;
    if (!card || isTypingElsewhere(card)) return;
    if (card.contains(card.ownerDocument.activeElement)) return;
    card.focus({ preventScroll: true });
  }, [promptId, announcement, announce]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const action = promptKeyAction(e.nativeEvent, {
      target: promptKeyTarget(e.target),
      optionCount,
      queueLength: queue?.count ?? 1,
    });
    if (!action) return;
    if (action.type === "previous" || action.type === "next") {
      e.preventDefault();
      queue?.onStep(action.type === "next" ? 1 : -1);
      return;
    }
    // Still swallowed before it arms, so an early Enter does nothing at all.
    e.preventDefault();
    if (action.type !== "refuse" && !isArmed) return;
    onKeyAction(action);
  }

  return (
    <Card
      ref={cardRef}
      elevation="low"
      padding={4}
      role="region"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      xstyle={styles.card}
    >
      <VStack gap={3}>
        <HStack gap={2} align="start" justify="between">
          <HStack gap={2} align="start">
            <Icon icon={icon} size="sm" color="warning" />
            <VStack gap={0.5}>
              <Heading level={4}>{title}</Heading>
              {subtitle != null && (
                <Text type="supporting" color="secondary">
                  {subtitle}
                </Text>
              )}
            </VStack>
          </HStack>
          <HStack gap={1} align="center">
            {queue && queue.count > 1 && (
              <>
                <IconButton
                  variant="ghost"
                  size="sm"
                  label="Previous request"
                  tooltip="Previous request ([)"
                  icon={<ChevronLeft size={14} />}
                  onClick={() => queue.onStep(-1)}
                />
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {`${queue.index + 1} of ${queue.count}`}
                </Text>
                <IconButton
                  variant="ghost"
                  size="sm"
                  label="Next request"
                  tooltip="Next request (])"
                  icon={<ChevronRight size={14} />}
                  onClick={() => queue.onStep(1)}
                />
              </>
            )}
            {headerEnd}
          </HStack>
        </HStack>
        {children}
        <HStack gap={2} align="center" justify="end">
          {actions}
        </HStack>
      </VStack>
    </Card>
  );
}
