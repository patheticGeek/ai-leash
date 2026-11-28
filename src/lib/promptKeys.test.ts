import { describe, expect, it } from "vitest";
import {
  currentPromptIndex,
  isActivatingTarget,
  isTextEntryTarget,
  optionKey,
  type PromptKeyContext,
  type PromptKeyEvent,
  type PromptKeyTarget,
  promptKeyAction,
  stepPromptIndex,
  truncateLines,
} from "./promptKeys";

function key(k: string, mods: Partial<PromptKeyEvent> = {}): PromptKeyEvent {
  return {
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    ...mods,
  };
}

const CARD: PromptKeyTarget = { tagName: "DIV", role: "region" };
const BUTTON: PromptKeyTarget = { tagName: "BUTTON" };
const TEXT: PromptKeyTarget = { tagName: "INPUT", type: "text" };
const RADIO: PromptKeyTarget = { tagName: "INPUT", type: "radio" };

function ctx(
  target: PromptKeyTarget | null,
  more: Partial<PromptKeyContext> = {},
): PromptKeyContext {
  return { target, optionCount: 2, queueLength: 1, ...more };
}

describe("promptKeyAction", () => {
  it("maps Enter to the primary option and Escape to refusing", () => {
    expect(promptKeyAction(key("Enter"), ctx(CARD))).toEqual({
      type: "primary",
    });
    expect(promptKeyAction(key("Escape"), ctx(CARD))).toEqual({
      type: "refuse",
    });
  });

  it("maps number keys to options in order, within the option count", () => {
    expect(promptKeyAction(key("1"), ctx(CARD))).toEqual({
      type: "option",
      index: 0,
    });
    expect(promptKeyAction(key("2"), ctx(CARD))).toEqual({
      type: "option",
      index: 1,
    });
    expect(promptKeyAction(key("3"), ctx(CARD))).toBeNull();
    expect(promptKeyAction(key("0"), ctx(CARD))).toBeNull();
  });

  it("leaves letters alone — there are no letter keys", () => {
    expect(promptKeyAction(key("a"), ctx(CARD))).toBeNull();
    expect(promptKeyAction(key("d"), ctx(CARD))).toBeNull();
  });

  it("lets a text field keep characters but still acts on Enter and Escape", () => {
    expect(promptKeyAction(key("1"), ctx(TEXT))).toBeNull();
    expect(promptKeyAction(key("]"), ctx(TEXT, { queueLength: 3 }))).toBeNull();
    expect(promptKeyAction(key("Enter"), ctx(TEXT))).toEqual({
      type: "primary",
    });
    expect(promptKeyAction(key("Escape"), ctx(TEXT))).toEqual({
      type: "refuse",
    });
  });

  it("leaves Enter on a focused button to the button itself", () => {
    expect(promptKeyAction(key("Enter"), ctx(BUTTON))).toBeNull();
    expect(promptKeyAction(key("1"), ctx(BUTTON))).toEqual({
      type: "option",
      index: 0,
    });
  });

  it("treats a focused radio as a choice, not a text field", () => {
    expect(promptKeyAction(key("Enter"), ctx(RADIO))).toEqual({
      type: "primary",
    });
    expect(promptKeyAction(key("2"), ctx(RADIO))).toEqual({
      type: "option",
      index: 1,
    });
  });

  it("ignores modified, repeated, composing and already-handled keys", () => {
    expect(promptKeyAction(key("Enter", { ctrlKey: true }), ctx(CARD))).toBe(
      null,
    );
    expect(promptKeyAction(key("1", { metaKey: true }), ctx(CARD))).toBeNull();
    expect(promptKeyAction(key("1", { altKey: true }), ctx(CARD))).toBeNull();
    expect(promptKeyAction(key("Enter", { shiftKey: true }), ctx(CARD))).toBe(
      null,
    );
    expect(promptKeyAction(key("Enter", { repeat: true }), ctx(CARD))).toBe(
      null,
    );
    expect(promptKeyAction(key("1", { repeat: true }), ctx(CARD))).toBeNull();
    expect(
      promptKeyAction(key("Enter", { isComposing: true }), ctx(CARD)),
    ).toBeNull();
    expect(
      promptKeyAction(key("Escape", { defaultPrevented: true }), ctx(CARD)),
    ).toBeNull();
  });

  it("steps through a queue with [ and ] only when there's more than one", () => {
    expect(promptKeyAction(key("["), ctx(CARD))).toBeNull();
    expect(promptKeyAction(key("["), ctx(CARD, { queueLength: 2 }))).toEqual({
      type: "previous",
    });
    expect(promptKeyAction(key("]"), ctx(CARD, { queueLength: 2 }))).toEqual({
      type: "next",
    });
  });
});

describe("targets", () => {
  it("knows which focus types text", () => {
    expect(isTextEntryTarget(TEXT)).toBe(true);
    expect(isTextEntryTarget({ tagName: "INPUT", type: "number" })).toBe(true);
    expect(isTextEntryTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextEntryTarget({ tagName: "DIV", isContentEditable: true })).toBe(
      true,
    );
    expect(isTextEntryTarget({ tagName: "DIV", role: "spinbutton" })).toBe(
      true,
    );
    expect(isTextEntryTarget(RADIO)).toBe(false);
    expect(isTextEntryTarget({ tagName: "INPUT", type: "checkbox" })).toBe(
      false,
    );
    expect(isTextEntryTarget(BUTTON)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });

  it("knows which focus activates on Enter", () => {
    expect(isActivatingTarget(BUTTON)).toBe(true);
    expect(isActivatingTarget({ tagName: "DIV", role: "button" })).toBe(true);
    expect(isActivatingTarget({ tagName: "BUTTON", role: "radio" })).toBe(
      false,
    );
    expect(isActivatingTarget(CARD)).toBe(false);
  });
});

describe("optionKey", () => {
  it("numbers the first nine options", () => {
    expect(optionKey(0)).toBe("1");
    expect(optionKey(8)).toBe("9");
    expect(optionKey(9)).toBeNull();
    expect(optionKey(-1)).toBeNull();
  });
});

describe("queue position", () => {
  it("falls back to the oldest when the picked prompt is gone", () => {
    expect(currentPromptIndex(["a", "b", "c"], null)).toBe(0);
    expect(currentPromptIndex(["a", "b", "c"], "c")).toBe(2);
    expect(currentPromptIndex(["a", "b"], "gone")).toBe(0);
  });

  it("wraps when stepping", () => {
    expect(stepPromptIndex(0, 3, -1)).toBe(2);
    expect(stepPromptIndex(2, 3, 1)).toBe(0);
    expect(stepPromptIndex(1, 3, 1)).toBe(2);
    expect(stepPromptIndex(0, 0, 1)).toBe(0);
  });
});

describe("truncateLines", () => {
  it("keeps short text whole", () => {
    expect(truncateLines("a\nb", 3)).toEqual({ text: "a\nb", hiddenLines: 0 });
  });

  it("cuts long text and counts what's hidden", () => {
    expect(truncateLines("1\n2\n3\n4\n5", 2)).toEqual({
      text: "1\n2",
      hiddenLines: 3,
    });
  });
});
