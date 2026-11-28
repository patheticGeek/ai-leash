import { HStack } from "@astryxdesign/core/HStack";
import * as stylex from "@stylexjs/stylex";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

// The board's controls live in the window's top band, not in a second
// toolbar row under it. The band (`CenterPanel`, `CentreBandEnd`) renders
// two empty slots — after the `project / Board` crumbs and before the
// layout switch — and `BoardView`, which owns the board's state and
// dialogs, portals its controls into them. In the Chat layout there's no
// BoardView, so the slots stay empty and the band holds just the crumbs
// and the switch.

type Slot = "start" | "end";

// How much room the band has, by its width: everything shows (`wide`); the
// icon tools fold into one ⋯ menu and the layout switch drops its labels
// (`narrow`); New task drops its label too and the epic filter narrows
// (`tight`).
export type BandFit = "wide" | "narrow" | "tight";

// Band widths, in px, at which the next fit starts. `wide` needs roughly
// 980px with the debug toggle on; `narrow` roughly 780px.
const WIDE_MIN = 1040;
const NARROW_MIN = 820;

export function fitForWidth(width: number): BandFit {
  if (width >= WIDE_MIN) return "wide";
  if (width >= NARROW_MIN) return "narrow";
  return "tight";
}

const targets: Record<Slot, HTMLElement | null> = { start: null, end: null };
let fit: BandFit = "wide";
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const styles = stylex.create({
  // The slot adds no box of its own: its controls sit in the band's row
  // with the band's own gap, so an empty slot leaves no stray gap.
  slot: { display: "contents" },
});

// Where the board's controls land in the band.
export function BoardBandSlot({ slot }: { slot: Slot }) {
  const ref = useCallback(
    (el: HTMLElement | null) => {
      targets[slot] = el;
      notify();
    },
    [slot],
  );
  return <HStack ref={ref} xstyle={styles.slot} />;
}

// Renders `children` into a band slot, once the band has mounted it.
export function BoardBandPortal({
  slot,
  children,
}: {
  slot: Slot;
  children: ReactNode;
}) {
  const target = useSyncExternalStore(subscribe, () => targets[slot]);
  return target ? createPortal(children, target) : null;
}

// The band's current fit, for the controls in it.
export function useBandFit(): BandFit {
  return useSyncExternalStore(subscribe, () => fit);
}

// Tracks the band's width through an element exactly as wide as it — the
// board view's root, which spans the centre pane under the band — while
// that element is mounted (`key` re-runs it when the element changes);
// back to `wide` once it's gone (the Chat layout, which shows no board
// controls). Only a change of fit re-renders anyone.
export function useTrackBandFit(
  ref: RefObject<HTMLElement | null>,
  key: unknown,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` re-runs this when the measured element changes.
  useLayoutEffect(() => {
    const el = ref.current;
    const set = (next: BandFit) => {
      if (next === fit) return;
      fit = next;
      notify();
    };
    if (!el) {
      set("wide");
      return;
    }
    const measure = () => set(fitForWidth(el.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      set("wide");
    };
  }, [ref, key]);
}
