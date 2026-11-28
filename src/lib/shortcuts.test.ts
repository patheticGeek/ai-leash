import { describe, expect, it } from "vitest";
import {
  formatShortcut,
  isBareKey,
  isBareKeyBlocked,
  isInTerminalOrEditor,
  isOverlayOpen,
  isTypingTarget,
  type KeyLike,
  matchesShortcut,
  SHORTCUTS,
  shortcutForEvent,
} from "./shortcuts";

function key(
  k: string,
  mods: Partial<Omit<KeyLike, "key"> & { target: EventTarget | null }> = {},
): KeyLike & { target: EventTarget | null } {
  return {
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    ...mods,
  };
}

// A focus target that's inside (or not inside) a terminal/editor, without
// a DOM: only `closest` is read.
function targetIn(selectorMatches: boolean): EventTarget {
  return {
    closest: () => (selectorMatches ? {} : null),
  } as unknown as EventTarget;
}

describe("matchesShortcut", () => {
  it("matches Ctrl on Linux/Windows", () => {
    expect(matchesShortcut(key("k", { ctrlKey: true }), "mod+k", false)).toBe(
      true,
    );
    expect(matchesShortcut(key("k", { metaKey: true }), "mod+k", false)).toBe(
      false,
    );
  });

  it("matches Command on macOS, not Ctrl", () => {
    expect(matchesShortcut(key("k", { metaKey: true }), "mod+k", true)).toBe(
      true,
    );
    expect(matchesShortcut(key("k", { ctrlKey: true }), "mod+k", true)).toBe(
      false,
    );
  });

  it("needs the modifiers to match exactly", () => {
    expect(
      matchesShortcut(
        key("K", { ctrlKey: true, shiftKey: true }),
        "mod+k",
        false,
      ),
    ).toBe(false);
    expect(
      matchesShortcut(
        key("k", { ctrlKey: true, altKey: true }),
        "mod+k",
        false,
      ),
    ).toBe(false);
    expect(matchesShortcut(key("k"), "mod+k", false)).toBe(false);
  });

  it("matches digits and the comma", () => {
    expect(matchesShortcut(key("1", { ctrlKey: true }), "mod+1", false)).toBe(
      true,
    );
    expect(matchesShortcut(key(",", { ctrlKey: true }), "mod+,", false)).toBe(
      true,
    );
    expect(matchesShortcut(key("2", { ctrlKey: true }), "mod+1", false)).toBe(
      false,
    );
  });

  it("falls back to the physical key on other layouts", () => {
    expect(
      matchesShortcut(
        key("л", { code: "KeyK", ctrlKey: true }),
        "mod+k",
        false,
      ),
    ).toBe(true);
  });
});

// Focus on an element of the given tag, outside any terminal/editor.
function element(tagName: string, isContentEditable = false): EventTarget {
  return {
    tagName,
    isContentEditable,
    closest: () => null,
  } as unknown as EventTarget;
}

const noOverlay = () => false;

describe("bare-key shortcuts", () => {
  it("knows a bare key from a modified one", () => {
    expect(isBareKey("/")).toBe(true);
    expect(isBareKey("mod+k")).toBe(false);
    expect(isBareKey("shift+/")).toBe(false);
  });

  it("matches the key alone", () => {
    expect(matchesShortcut(key("/"), "/", false)).toBe(true);
    expect(matchesShortcut(key("/"), "/", true)).toBe(true);
    expect(matchesShortcut(key("?"), "/", false)).toBe(false);
  });

  it("rejects Ctrl, Command and Alt (Ctrl+/ isn't /)", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(matchesShortcut(key("/", { [mod]: true }), "/", false)).toBe(
        false,
      );
      expect(matchesShortcut(key("/", { [mod]: true }), "/", true)).toBe(false);
    }
  });

  it("matches a symbol typed with Shift, by its character only", () => {
    // `/` is Shift+7 on a German layout.
    expect(
      matchesShortcut(key("/", { code: "Digit7", shiftKey: true }), "/", false),
    ).toBe(true);
    // The US `/` key there types `-`: no match by physical key.
    expect(matchesShortcut(key("-", { code: "Slash" }), "/", false)).toBe(
      false,
    );
  });

  it("keeps a bare letter apart from its Shift form", () => {
    expect(matchesShortcut(key("g"), "g", false)).toBe(true);
    expect(matchesShortcut(key("G", { shiftKey: true }), "g", false)).toBe(
      false,
    );
  });

  it("isn't stolen from a mod shortcut by the same key", () => {
    expect(matchesShortcut(key("/"), "mod+/", false)).toBe(false);
  });
});

describe("the bare-key typing guard", () => {
  it("treats fields, selects and contenteditable as typing", () => {
    for (const tag of ["input", "TEXTAREA", "select"]) {
      expect(isTypingTarget(element(tag))).toBe(true);
    }
    expect(isTypingTarget(element("div", true))).toBe(true);
    expect(isTypingTarget(targetIn(true))).toBe(true);
  });

  it("doesn't treat a button, the page or no target as typing", () => {
    expect(isTypingTarget(element("BUTTON"))).toBe(false);
    expect(isTypingTarget(element("BODY"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("is blocked while a dialog, menu or popover is open", () => {
    expect(isBareKeyBlocked(element("BODY"), () => true)).toBe(true);
    expect(isBareKeyBlocked(element("BODY"), noOverlay)).toBe(false);
  });

  it("runs `/` outside any field with nothing open", () => {
    expect(
      shortcutForEvent(key("/", { target: element("BODY") }), false, noOverlay)
        ?.id,
    ).toBe("focusComposer");
    expect(
      shortcutForEvent(key("/", { target: element("BUTTON") }), true, noOverlay)
        ?.id,
    ).toBe("focusComposer");
  });

  it("leaves `/` to type in a field, the terminal or the editor", () => {
    for (const target of [
      element("TEXTAREA"),
      element("INPUT"),
      element("DIV", true),
      targetIn(true),
    ]) {
      expect(shortcutForEvent(key("/", { target }), false, noOverlay)).toBe(
        null,
      );
    }
  });

  it("leaves `/` alone while an overlay is open", () => {
    expect(
      shortcutForEvent(
        key("/", { target: element("BODY") }),
        false,
        () => true,
      ),
    ).toBeNull();
  });

  it("doesn't run on Ctrl+/", () => {
    expect(
      shortcutForEvent(
        key("/", { ctrlKey: true, target: element("BODY") }),
        false,
        noOverlay,
      ),
    ).toBeNull();
  });

  it("finds no overlay without a document", () => {
    expect(isOverlayOpen(null)).toBe(false);
  });
});

describe("shortcutForEvent", () => {
  it("finds every registered shortcut by its keys", () => {
    for (const s of Object.values(SHORTCUTS)) {
      const last = s.keys.split("+").pop() ?? "";
      const ctrlKey = s.keys.includes("mod");
      expect(
        shortcutForEvent(key(last, { ctrlKey }), false, noOverlay)?.id,
      ).toBe(s.id);
    }
  });

  it("returns null for keys nothing uses", () => {
    expect(shortcutForEvent(key("q", { ctrlKey: true }), false)).toBeNull();
    expect(shortcutForEvent(key("w", { ctrlKey: true }), false)).toBeNull();
  });

  it("skips all but the palette inside a terminal or the editor", () => {
    const inside = targetIn(true);
    expect(
      shortcutForEvent(key("b", { ctrlKey: true, target: inside }), false),
    ).toBeNull();
    expect(
      shortcutForEvent(key("j", { ctrlKey: true, target: inside }), false),
    ).toBeNull();
    expect(
      shortcutForEvent(key("k", { ctrlKey: true, target: inside }), false)?.id,
    ).toBe("palette");
  });

  it("runs everywhere else, typing in the composer included", () => {
    expect(
      shortcutForEvent(
        key("b", { ctrlKey: true, target: targetIn(false) }),
        false,
      )?.id,
    ).toBe("toggleSidebar");
  });
});

describe("isInTerminalOrEditor", () => {
  it("is false with no target or a non-element target", () => {
    expect(isInTerminalOrEditor(null)).toBe(false);
    expect(isInTerminalOrEditor({} as EventTarget)).toBe(false);
  });
});

describe("formatShortcut", () => {
  it("spells out Ctrl on Linux/Windows", () => {
    expect(formatShortcut("mod+k", false)).toBe("Ctrl+K");
    expect(formatShortcut("mod+,", false)).toBe("Ctrl+,");
  });

  it("shows a bare key as itself", () => {
    expect(formatShortcut("/", false)).toBe("/");
    expect(formatShortcut("/", true)).toBe("/");
  });

  it("uses symbols on macOS", () => {
    expect(formatShortcut("mod+k", true)).toBe("⌘K");
    expect(formatShortcut("mod+shift+p", true)).toBe("⌘⇧P");
  });
});
