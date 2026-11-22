import { usePopover } from "@astryxdesign/core/Popover";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { type ReactNode, type RefObject, useLayoutEffect, useRef } from "react";

const styles = stylex.create({
  // As wide as the chat input box it sits on.
  layer: {
    width: "anchor-size(width)",
  },
  surface: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  maxHeight: (maxHeight: string) => ({ maxHeight }),
});

// A surface that sits above the chat input box (`anchorRef`) for as long as
// it's mounted — the slash-command list, the permission ask and the
// elicitation form. Not a Popover: there's no trigger button, nothing
// outside it dismisses it (the caller decides when to unmount it), and it
// only takes focus when `hasAutoFocus` asks, so the slash list can leave
// focus in the textarea.
export default function InputAnchoredPopover({
  anchorRef,
  label,
  hasAutoFocus = false,
  maxHeight,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  hasAutoFocus?: boolean;
  maxHeight?: string;
  children: ReactNode;
}) {
  const popover = usePopover({
    anchorRef,
    dialogLabel: label,
    isModal: false,
    hasAutoFocus,
    hasLightDismiss: false,
    hasEscapeDismiss: false,
    hasCloseButton: false,
    padding: 0,
    xstyle: [styles.surface, maxHeight != null && styles.maxHeight(maxHeight)],
  });
  // Open for exactly as long as this is mounted. Through a ref, so a new
  // `show`/`hide` identity never re-runs the open (and its auto-focus).
  const popoverRef = useRef(popover);
  popoverRef.current = popover;
  const autoFocusRef = useRef(hasAutoFocus);
  useLayoutEffect(() => {
    popoverRef.current.show({ skipAutoFocus: !autoFocusRef.current });
    return () => popoverRef.current.hide();
  }, []);

  return popover.render(children, {
    placement: "above",
    alignment: "center",
    offset: spacingVars["--spacing-1"],
    xstyle: styles.layer,
  });
}
