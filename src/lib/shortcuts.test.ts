import { describe, expect, it } from "vitest";
import {
  formatShortcut,
  isInTerminalOrEditor,
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

describe("shortcutForEvent", () => {
  it("finds every registered shortcut by its keys", () => {
    for (const s of Object.values(SHORTCUTS)) {
      const last = s.keys.split("+").pop() ?? "";
      expect(shortcutForEvent(key(last, { ctrlKey: true }), false)?.id).toBe(
        s.id,
      );
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

  it("uses symbols on macOS", () => {
    expect(formatShortcut("mod+k", true)).toBe("⌘K");
    expect(formatShortcut("mod+shift+p", true)).toBe("⌘⇧P");
  });
});
