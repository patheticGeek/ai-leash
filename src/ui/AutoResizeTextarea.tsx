import type * as React from "react";
import { useImperativeHandle, useLayoutEffect, useRef } from "react";
import { Textarea } from "./textarea";

type AutoResizeTextareaProps = Omit<
  React.ComponentProps<"textarea">,
  "rows"
> & {
  /** Rows tall when empty; the textarea never shrinks below this. */
  minRows?: number;
  /** Rows tall at most; past this it scrolls instead of growing. */
  maxRows?: number;
};

// A `Textarea` that grows with its content between `minRows` and `maxRows`
// (then scrolls). Every other prop, including `ref`, goes straight to the
// `<textarea>`, controlled or uncontrolled. The height is re-measured on user
// input and whenever `value`/`defaultValue` changes — for an uncontrolled
// textarea whose DOM value is written directly, changing `defaultValue`
// alongside is what signals that the content changed.
function AutoResizeTextarea({
  minRows = 1,
  maxRows = 6,
  value,
  defaultValue,
  onInput,
  ref,
  ...props
}: AutoResizeTextareaProps) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  function resize() {
    const el = innerRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const minHeight = lineHeight * minRows + paddingY;
    const maxHeight = lineHeight * maxRows + paddingY;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: value/defaultValue are trigger-only deps — their contents aren't read, a change just means the text changed
  useLayoutEffect(resize, [value, defaultValue, minRows, maxRows]);

  return (
    <Textarea
      ref={innerRef}
      rows={minRows}
      value={value}
      defaultValue={defaultValue}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      {...props}
    />
  );
}

export { AutoResizeTextarea };
