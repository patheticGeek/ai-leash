import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { useAnnounce } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Kbd } from "@astryxdesign/core/Kbd";
import { Text } from "@astryxdesign/core/Text";
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
import { formatDuration } from "../../../../lib/format";
import {
  isTextEntryTarget,
  type PromptKeyAction,
  promptKeyAction,
  promptKeyTarget,
} from "../../../../lib/promptKeys";
import { kbdKeys } from "../../../../lib/shortcuts";
import { useAppStore } from "../../../../store";

// How long a fresh prompt ignores Enter and the number keys. The prompt
// takes the message box's place, so an Enter meant for the message the user
// was typing could otherwise answer a request they haven't read. Escape (the
// safe answer) and stepping work at once.
const ARM_DELAY_MS = 400;

const styles = stylex.create({
  card: {
    // Only ever focused from code (tabIndex -1), to take the prompt's keys;
    // the amber icon and label already mark it as waiting on you.
    outlineStyle: "none",
  },
  heading: { color: colorVars["--color-text-warning"] },
  // A `Kbd` inside a `Button` (`endContent`). Kbd paints its own light text
  // on a light-tinted key, which vanishes on a `primary` button's light
  // fill; this re-points its tokens at the button's own foreground, dimmed,
  // so the key reads on every variant.
  buttonKbd: {
    // The theme draws keys as ghost boxes (transparent, thin
    // `--color-border-emphasized` border, `--color-text-secondary` text);
    // inside a button both follow the button's own foreground instead.
    "--color-text-primary": "currentColor",
    "--color-text-secondary": "currentColor",
    "--color-neutral": "color-mix(in srgb, currentColor 14%, transparent)",
    "--color-border-emphasized":
      "color-mix(in srgb, currentColor 35%, transparent)",
    opacity: 0.75,
  },
});

// A key hint for a prompt's button, readable on its variant. `keys` is in
// `Kbd` form (`kbdKeys`).
export function ButtonKbd({ keys }: { keys: string }) {
  return <Kbd keys={kbdKeys(keys)} xstyle={styles.buttonKbd} />;
}

// When each prompt was first on screen, for the header's "waiting" time —
// kept across re-mounts (stepping away and back, a form's next question).
const firstSeen = new Map<string, number>();
const FIRST_SEEN_LIMIT = 200;
function firstSeenAt(id: string): number {
  const known = firstSeen.get(id);
  if (known !== undefined) return known;
  const at = Date.now();
  firstSeen.set(id, at);
  if (firstSeen.size > FIRST_SEEN_LIMIT) {
    const oldest = firstSeen.keys().next().value;
    if (oldest !== undefined) firstSeen.delete(oldest);
  }
  return at;
}

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
// composer's place as one compact card (`Card elevation=low`) with a thin
// amber leading edge for "needs you". One small header line — amber icon and
// a short label ("Wants to run a command"), a muted detail, then "1 of N"
// stepping, how long it's been waiting and `headerEnd` at the end — then the
// content, then one row of small buttons, primary first, each with its key
// (`ButtonKbd`). `ChatComposer` swaps it in.
//
// It owns the prompt keyboard (`lib/promptKeys.ts`): keys act only while
// focus is inside the card, so nothing the user types elsewhere is taken.
// When a prompt appears (a new `promptId`) the card focuses itself — unless
// the user is typing in another field, the terminal or the editor — and says
// what it's asking through the live region.
export default function PromptCard({
  promptId,
  icon,
  heading,
  detail,
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
  // The header's short label: what the agent wants, in a few words.
  heading: string;
  // Muted, after the label: who's asking, "Question 2 of 3".
  detail?: string;
  // At the header's end, e.g. a dismiss button.
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

  // How long this request has been waiting, ticking each second.
  const [clock, setClock] = useState<{
    id: string;
    since: number;
    now: number;
  } | null>(null);
  useEffect(() => {
    const since = firstSeenAt(promptId);
    const tick = () => setClock({ id: promptId, since, now: Date.now() });
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [promptId]);
  const waited =
    clock?.id === promptId
      ? formatDuration((clock.now - clock.since) / 1000)
      : null;

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
      padding={3}
      role="region"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      xstyle={styles.card}
    >
      <VStack gap={2}>
        <HStack gap={2} align="center" justify="between">
          <HStack gap={2} align="center">
            <Icon icon={icon} size="xsm" color="warning" />
            <Text size="sm" maxLines={1} xstyle={styles.heading}>
              {heading}
            </Text>
            {detail && (
              <Text size="sm" color="secondary" maxLines={1}>
                {detail}
              </Text>
            )}
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
                <Text size="xsm" color="secondary" hasTabularNumbers>
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
            {waited && (
              <Text size="xsm" color="secondary" hasTabularNumbers>
                {waited}
              </Text>
            )}
            {headerEnd}
          </HStack>
        </HStack>
        {children}
        <HStack gap={2} align="center" wrap="wrap">
          {actions}
        </HStack>
      </VStack>
    </Card>
  );
}
