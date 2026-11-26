import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import {
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { createContext, useEffect, useMemo, useRef, useState } from "react";
import {
  BOOT_KEY,
  buildPreviewDocument,
  HEIGHT_KEY,
} from "./htmlPreviewDocument";

export { isHtmlDocument } from "./htmlPreviewDocument";

// A live, sandboxed render of agent-written HTML (a prototype, a mockup, a
// small demo) — used by `Markdown`'s ```html blocks and the preview tab.
// See docs/features/agent-chat.md ("HTML previews") for the whole model.
//
// The sandbox, layer by layer:
//  - `sandbox="allow-scripts allow-forms"` without `allow-same-origin`: the
//    document gets an opaque origin, so it can't read the app's DOM,
//    storage, cookies or `window.__TAURI_INTERNALS__` (every access to
//    `parent`'s properties throws), and can't navigate the app (no
//    `allow-top-navigation`) or open windows (no `allow-popups`) or modals.
//    `allow-forms` is there only so a prototype's `submit` handler fires;
//    the CSP's `form-action 'none'` still stops any real submission.
//  - A CSP `<meta>` injected ahead of everything else: inline scripts and
//    styles and `data:`/`blob:` images, fonts and media only — no network
//    at all (no CDNs, fetch, XHR, WebSockets, workers or sub-frames). A
//    later `<meta>` in the agent's HTML can only tighten it, never loosen.
//  - A small script, also injected first, that announces itself, reports
//    the content height to the app (for auto-sizing) and blocks link clicks
//    that would leave the page. A page that navigates itself anyway
//    (`location = …`, a meta refresh) loads without that announcement and
//    is stopped — see `counts`.
//
// The app's own Tauri IPC also needs an invoke key that only the top
// frame's init script holds, so a frame that somehow reached the webview's
// message handler still couldn't call a command.

/** What the transcript's host lets a preview do outside its frame: open it
 * in a tab of its own, save it as a file. Provided by `TabContentHost`, like
 * `RunCommandContext`; without it those buttons just don't show. */
export interface HtmlPreviewActions {
  open: (html: string) => void;
  save: (html: string) => void;
}

export const HtmlPreviewContext = createContext<HtmlPreviewActions | null>(
  null,
);

// How long after a frame `load` its bootstrap's hello may still arrive.
const BOOT_GRACE_MS = 1000;

// Before the frame first reports its height.
const INITIAL_HEIGHT = 160;
// Inline caps, as fractions of the window's height; content taller than the
// collapsed cap gets an expand button, and scrolls inside the frame past
// the expanded one. A capped height also ends the feedback loop a
// `min-height: 100vh` page would otherwise start (taller frame → taller
// page → taller frame).
const COLLAPSED_CAP = 0.5;
const EXPANDED_CAP = 0.85;

const styles = stylex.create({
  frame: {
    display: "block",
    width: "100%",
    borderWidth: 0,
    // The page's own canvas: white unless it paints one, whatever the
    // app's theme. System colours, not a hex.
    colorScheme: "light",
    backgroundColor: "Canvas",
  },
  fill: { height: "100%" },
  height: (h: number) => ({ height: h }),
  stopped: {
    padding: spacingVars["--spacing-3"],
    borderRadius: radiusVars["--radius-element"],
  },
});

export interface HtmlPreviewFrameProps {
  html: string;
  /** Fill the parent's height (a tab) instead of sizing to the content. */
  isFill?: boolean;
  /** Inline only: use the taller cap. */
  isExpanded?: boolean;
  /** Inline only: whether the content is taller than the collapsed cap. */
  onOverflowChange?: (overflows: boolean) => void;
  title?: string;
}

export function HtmlPreviewFrame({
  html,
  isFill = false,
  isExpanded = false,
  onOverflowChange,
  title = "HTML preview",
}: HtmlPreviewFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  // Loads of the frame and starts of our bootstrap in it. Each document we
  // gave it boots once, so a load that isn't matched by a boot is some other
  // page the frame navigated to. (Not "a second load": dragging the chat tab
  // between areas moves the frame in the DOM, which reloads the same
  // document — bootstrap and all.) Compared a moment after each load, since
  // the boot message can arrive on either side of the `load` event.
  const counts = useRef({ loads: 0, boots: 0 });
  const [navigated, setNavigated] = useState(false);
  // Remounts the frame, from the stopped notice's Reload.
  const [generation, setGeneration] = useState(0);
  const srcDoc = useMemo(() => buildPreviewDocument(html), [html]);

  function reload() {
    counts.current = { loads: 0, boots: 0 };
    setNavigated(false);
    setContentHeight(null);
    setGeneration((g) => g + 1);
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Only this frame's own messages; the payload is just a number.
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const data = e.data as Record<string, unknown> | null;
      if (data?.[BOOT_KEY]) counts.current.boots += 1;
      const h = data?.[HEIGHT_KEY];
      // A frame inside a hidden tab measures 0; keep the last real height.
      if (typeof h === "number" && Number.isFinite(h) && h > 0) {
        setContentHeight(Math.ceil(h));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const collapsedCap = window.innerHeight * COLLAPSED_CAP;
  const overflows = contentHeight !== null && contentHeight > collapsedCap;
  useEffect(() => {
    onOverflowChange?.(overflows);
  }, [overflows, onOverflowChange]);

  if (navigated) {
    return (
      <VStack gap={2} align="start" xstyle={styles.stopped}>
        <Text type="supporting" color="secondary">
          This preview tried to load another page, so it was stopped. Previews
          can't leave the HTML they were given.
        </Text>
        <Button
          size="sm"
          variant="secondary"
          label="Reload preview"
          onClick={reload}
        />
      </VStack>
    );
  }

  const cap = window.innerHeight * (isExpanded ? EXPANDED_CAP : COLLAPSED_CAP);
  const height = Math.min(contentHeight ?? INITIAL_HEIGHT, cap);
  return (
    <iframe
      key={generation}
      ref={ref}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
      onLoad={() => {
        counts.current.loads += 1;
        const c = counts.current;
        setTimeout(() => {
          if (counts.current === c && c.boots < c.loads) setNavigated(true);
        }, BOOT_GRACE_MS);
      }}
      {...stylex.props(
        styles.frame,
        isFill ? styles.fill : styles.height(height),
      )}
    />
  );
}
