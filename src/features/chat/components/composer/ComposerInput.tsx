import { useChatComposerContext } from "@astryxdesign/core/Chat";
import { TextArea } from "@astryxdesign/core/TextArea";
import {
  spacingVars,
  typeScaleVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { SquareTerminal } from "lucide-react";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
} from "react";
import { COMPOSER_MIN_ROWS, usePreference } from "@/data/preferences";

const styles = stylex.create({
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

const placeholderText = (composeMode: boolean) =>
  `Ask the agent, / for commands, ! for shell\n${composeMode ? "Ctrl+Enter" : "Enter"} to send`;

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
// per compose mode, Ctrl+Enter to queue mid-turn, the slash menu's arrows,
// and "!" for shell mode (which shows a terminal icon at the start).
export default function ComposerInput({
  value,
  onChange,
  onKeyDown,
  textareaRef,
  shellMode,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  shellMode: boolean;
}) {
  const composeMode = usePreference("composeMode");
  const composerMaxRows = usePreference("composerMaxRows");
  useAutoGrow(textareaRef, value, COMPOSER_MIN_ROWS, composerMaxRows);

  // Lets a click on the composer's empty space focus this field.
  const composer = useChatComposerContext();
  const controlRef = composer?.inputControlRef;
  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = { focus: () => textareaRef.current?.focus() };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, textareaRef]);

  return (
    <TextArea
      ref={textareaRef}
      label="Message"
      isLabelHidden
      width="100%"
      value={value}
      onChange={onChange}
      onKeyDown={(e) => onKeyDown(e as KeyboardEvent<HTMLTextAreaElement>)}
      placeholder={placeholderText(composeMode)}
      rows={COMPOSER_MIN_ROWS}
      startIcon={shellMode ? SquareTerminal : undefined}
      controlXstyle={styles.bareControl}
    />
  );
}
