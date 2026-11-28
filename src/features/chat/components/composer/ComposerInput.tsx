import { useChatComposerContext } from "@astryxdesign/core/Chat";
import { Kbd } from "@astryxdesign/core/Kbd";
import { Stack } from "@astryxdesign/core/Stack";
import { TextArea } from "@astryxdesign/core/TextArea";
import {
  spacingVars,
  typeScaleVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { SquareTerminal } from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
  useImperativeHandle,
  useLayoutEffect,
  useState,
} from "react";
import { COMPOSER_MIN_ROWS, usePreference } from "@/data/preferences";
import { formatShortcut, kbdKeys, SHORTCUTS } from "@/lib/shortcuts";

const styles = stylex.create({
  // Anchors the `/` hint; the field fills it as it filled the slot.
  field: { position: "relative", width: "100%" },
  // The `/` hint (GitHub's search field style): at the end of the first
  // line, centred in the same --spacing-8 band as the text (see
  // `bareControl`), over the field so it never moves the layout, and
  // dimmed so it reads as a hint rather than a control. Clicks go through
  // to the field.
  focusHint: {
    position: "absolute",
    insetBlockStart: `calc((${spacingVars["--spacing-8"]} - ${spacingVars["--spacing-5"]}) / 2)`,
    insetInlineEnd: spacingVars["--spacing-1"],
    opacity: 0.6,
    pointerEvents: "none",
  },
  // The composer body around it already paints the surface and the focus
  // ring, so the field's own control box is invisible and flush with the
  // body's padding.
  bareControl: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    boxShadow: { default: "none", ":hover": "none", ":focus-within": "none" },
    outline: "none",
    // The text's first line sits in a band as tall as the footer row (the
    // 32px Send button, --spacing-8) and centred in it, so the visible gap
    // from the box's top edge to the text mirrors the one from the footer's
    // labels to the bottom edge, at any interface text size. TextArea's
    // textarea pads --spacing-1 on all sides: inline that's the ai-chat
    // template's own input inset (through this variable); block-wise it's
    // taken back by the margins.
    "--_textarea-inline-padding": spacingVars["--spacing-1"],
    marginBlockStart: `calc((${spacingVars["--spacing-8"]} - ${typeScaleVars["--text-body-leading"]} * ${typeScaleVars["--text-body-size"]}) / 2 - ${spacingVars["--spacing-1"]})`,
    marginBlockEnd: `calc(-1 * ${spacingVars["--spacing-1"]})`,
  },
});

// The keys to send, as symbols (⌃↵ / ⌘↵ in compose mode, ↵ otherwise). The
// `/`-to-focus key isn't here: the `/` hint at the box's end shows it.
const placeholderText = (composeMode: boolean) =>
  `Ask the agent, @ for files, / for commands, ! for shell\n${formatShortcut(composeMode ? "mod+enter" : "enter")} to send`;

// Grows the textarea with its content between `minRows` and `maxRows`
// lines, then scrolls. Re-measured whenever the text changes — typed or
// written programmatically — or the row limits do. The height is set on the
// element itself (it's a measurement, not a style), and with it the native
// resize grip goes, since the height follows the text.
function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  minRows: number,
  maxRows: number,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: value is a trigger-only dep — its contents aren't read, a change just means the text changed
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const minHeight = lineHeight * minRows + paddingY;
    const maxHeight = lineHeight * maxRows + paddingY;
    el.style.resize = "none";
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [ref, value, minRows, maxRows]);
}

// The message field in `ChatComposer`'s input slot: a plain textarea (the
// Astryx composer's custom-input contract — `useChatComposerContext`) rather
// than the stock token input, because the keys are ours: Enter / Ctrl+Enter
// per compose mode, Ctrl+Enter to queue mid-turn, the slash and `@` menus'
// arrows,
// and "!" for shell mode (which shows a terminal icon at the start). While
// it's empty and unfocused it shows the `/` key that focuses it
// (`focusComposer`) at its end.
export default function ComposerInput({
  value,
  onChange,
  onKeyDown,
  onPaste,
  textareaRef,
  shellMode,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  // Pasted images and files become attachments (`useAttachments`).
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  shellMode: boolean;
}) {
  const composeMode = usePreference("composeMode");
  const composerMaxRows = usePreference("composerMaxRows");
  useAutoGrow(textareaRef, value, COMPOSER_MIN_ROWS, composerMaxRows);

  // Lets a click on the composer's empty space focus this field.
  const composer = useChatComposerContext();
  useImperativeHandle(
    composer?.inputControlRef,
    () => ({ focus: () => textareaRef.current?.focus() }),
    [textareaRef],
  );

  const [isFocused, setIsFocused] = useState(false);
  const showFocusHint = !isFocused && value === "";

  return (
    <Stack xstyle={styles.field}>
      <TextArea
        ref={textareaRef}
        label="Message"
        isLabelHidden
        width="100%"
        value={value}
        onChange={onChange}
        onKeyDown={(e) => onKeyDown(e as KeyboardEvent<HTMLTextAreaElement>)}
        onPaste={onPaste}
        placeholder={placeholderText(composeMode)}
        rows={COMPOSER_MIN_ROWS}
        startIcon={shellMode ? SquareTerminal : undefined}
        controlXstyle={styles.bareControl}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
      {showFocusHint && (
        <Kbd
          keys={kbdKeys(SHORTCUTS.focusComposer.keys)}
          aria-hidden
          xstyle={styles.focusHint}
        />
      )}
    </Stack>
  );
}
