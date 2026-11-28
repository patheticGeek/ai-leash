// The app's global keyboard shortcuts, in one place: what each key does,
// how it's matched against a keydown, and how it's shown. `keys` is in the
// format Astryx's `Kbd` takes (`mod` is Command on macOS and Ctrl elsewhere),
// so the same string feeds the matcher, the key badges (through `kbdKeys`,
// which draws the modifiers as symbols) and the tooltips (`formatShortcut`). `useShortcuts`
// (`hooks/useShortcuts.ts`) is the one document listener that runs them.
//
// Most shortcuts use `mod`. A bare-key one (no modifier, like `/`) is a
// character too, so it only runs when the key wouldn't be typing anything:
// never with focus in a field, the terminal or the editor, nor while a
// dialog, menu or popover is open (`isBareKeyBlocked`).

export type ShortcutId =
  | "palette"
  | "newThread"
  | "toggleSidebar"
  | "toggleSidePanel"
  | "settings"
  | "openFiles"
  | "openTerminal"
  | "openSubAgents"
  | "openActions"
  | "focusComposer";

export interface Shortcut {
  id: ShortcutId;
  keys: string;
  label: string;
  // Still runs while focus is in a terminal or the code editor, which need
  // every other Ctrl combination for themselves.
  isAllowedInEditor?: boolean;
}

export const SHORTCUTS: Record<ShortcutId, Shortcut> = {
  palette: {
    id: "palette",
    keys: "mod+k",
    label: "Command palette",
    isAllowedInEditor: true,
  },
  newThread: { id: "newThread", keys: "mod+n", label: "New thread" },
  toggleSidebar: {
    id: "toggleSidebar",
    keys: "mod+b",
    label: "Toggle sidebar",
  },
  toggleSidePanel: {
    id: "toggleSidePanel",
    keys: "mod+j",
    label: "Toggle side panel",
  },
  settings: { id: "settings", keys: "mod+,", label: "Settings" },
  openFiles: { id: "openFiles", keys: "mod+1", label: "Open Files" },
  openTerminal: { id: "openTerminal", keys: "mod+2", label: "Open Terminal" },
  openSubAgents: {
    id: "openSubAgents",
    keys: "mod+3",
    label: "Open Sub agents",
  },
  openActions: { id: "openActions", keys: "mod+4", label: "Open Actions" },
  focusComposer: {
    id: "focusComposer",
    keys: "/",
    label: "Focus message box",
  },
};

// The keydown fields matching reads, so tests can pass plain objects.
export interface KeyLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

// The same detection Astryx's `Kbd` uses to pick ⌘ or Ctrl, so the badge
// and the matcher always agree.
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as { userAgentData?: { platform?: string } })
    .userAgentData;
  const named = uaData?.platform?.trim() ?? "";
  if (named !== "" && named.toLowerCase() !== "unknown") {
    return /mac/i.test(named);
  }
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? "");
}

interface ParsedKeys {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

// The last part is the key itself, so a bare "+" would still parse; the
// modifiers come before it.
function parseKeys(keys: string): ParsedKeys {
  const parts = keys.toLowerCase().split("+");
  const mods = parts.slice(0, -1);
  return {
    mod: mods.includes("mod"),
    shift: mods.includes("shift"),
    alt: mods.includes("alt"),
    key: parts[parts.length - 1],
  };
}

// No modifier at all: the key types a character, so it needs the typing
// guard (`isBareKeyBlocked`).
export function isBareKey(keys: string): boolean {
  const { mod, shift, alt } = parseKeys(keys);
  return !mod && !shift && !alt;
}

// The physical key, for layouts where `e.key` isn't the Latin letter.
function codeFor(key: string): string | null {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (key === ",") return "Comma";
  return null;
}

// `mod` is Command alone on macOS and Ctrl alone elsewhere; Shift and Alt
// must match exactly, so Ctrl+Shift+K isn't Ctrl+K. A bare key takes no
// Ctrl, Command or Alt (Ctrl+/ isn't `/`) and is matched on the character
// it types, so a symbol that needs Shift on some layouts (`/` is Shift+7 on
// a German one) still matches, and nothing matches by physical key.
export function matchesShortcut(
  e: KeyLike,
  keys: string,
  isMac: boolean,
): boolean {
  const want = parseKeys(keys);
  if (isBareKey(keys)) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    // A letter's Shift is a different shortcut (Shift+N is "N", not "n").
    if (/^[a-z]$/.test(want.key) && e.shiftKey) return false;
    return e.key.toLowerCase() === want.key;
  }
  const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (mod !== want.mod) return false;
  if (!want.mod && (e.ctrlKey || e.metaKey)) return false;
  if (e.shiftKey !== want.shift || e.altKey !== want.alt) return false;
  return (
    e.key.toLowerCase() === want.key ||
    (e.code != null && e.code === codeFor(want.key))
  );
}

// Focus inside a terminal (xterm) or the file editor (CodeMirror): those
// keep their own keys, so only `isAllowedInEditor` shortcuts run there.
export function isInTerminalOrEditor(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") {
    return false;
  }
  return (target as Element).closest(".xterm, .cm-editor") !== null;
}

// Focus where a key types: a text field, select, anything contenteditable,
// the terminal or the editor. Read off the element's own fields rather than
// `instanceof`, so it works on whichever document the target belongs to.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as Partial<HTMLElement>;
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable === true) return true;
  return isInTerminalOrEditor(target);
}

// Roles that make an open layer something you're working in, rather than
// a tooltip or a toast (both also live in the top layer).
const INTERACTIVE_LAYER =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

// A dialog, menu or popover is open: Astryx shows them as a native
// `<dialog open>` or a `:popover-open` element in the top layer (the command
// palette and Settings are dialogs).
export function isOverlayOpen(
  doc: Document | null = globalDocument(),
): boolean {
  if (!doc) return false;
  if (doc.querySelector("dialog[open]")) return true;
  let open: NodeListOf<Element>;
  try {
    open = doc.querySelectorAll(":popover-open");
  } catch {
    // An engine without the popover API has no popovers open either.
    return false;
  }
  return Array.from(open).some(
    (el) =>
      el.matches(INTERACTIVE_LAYER) || el.querySelector(INTERACTIVE_LAYER),
  );
}

function globalDocument(): Document | null {
  return typeof document === "undefined" ? null : document;
}

// Why a bare-key shortcut stays out of the way: the key would type into the
// focused field, or a layer that owns the keyboard is open.
export function isBareKeyBlocked(
  target: EventTarget | null,
  overlayOpen: () => boolean = isOverlayOpen,
): boolean {
  return isTypingTarget(target) || overlayOpen();
}

// The shortcut a keydown triggers, or null — none matched, or the focus
// guard skipped it. `overlayOpen` is there for tests (no DOM).
export function shortcutForEvent(
  e: KeyLike & { target: EventTarget | null },
  isMac: boolean,
  overlayOpen: () => boolean = isOverlayOpen,
): Shortcut | null {
  const match = Object.values(SHORTCUTS).find((s) =>
    matchesShortcut(e, s.keys, isMac),
  );
  if (!match) return null;
  if (isBareKey(match.keys)) {
    return isBareKeyBlocked(e.target, overlayOpen) ? null : match;
  }
  if (!match.isAllowedInEditor && isInTerminalOrEditor(e.target)) return null;
  return match;
}

// Kbd's spelling of a key, aliases resolved (`esc` → `escape`).
const KEY_ALIASES: Record<string, string> = { esc: "escape", return: "enter" };

function keyParts(keys: string): string[] {
  return keys
    .split("+")
    .map((k) => k.trim().toLowerCase())
    .map((k) => KEY_ALIASES[k] ?? k);
}

// Modifiers as symbols (⌃ for Ctrl, since Linux/Windows have no Command
// key). Alt has no common symbol off macOS, so it stays "Alt" there.
function modifierSymbol(key: string, isMac: boolean): string | null {
  switch (key) {
    case "mod":
      return isMac ? "⌘" : "⌃";
    case "ctrl":
      return "⌃";
    case "shift":
      return "⇧";
    case "alt":
      return isMac ? "⌥" : null;
    default:
      return null;
  }
}

// A registry key string (`mod+k`) as the `keys` to pass to Astryx's `Kbd`,
// with every modifier drawn as a symbol: `⌃+K` on Linux/Windows, where Kbd
// would write "Ctrl", "Shift" and "Alt" as words. Where Kbd already draws a
// symbol itself (the modifiers on macOS; Enter ↵, Tab ⇥ and the arrows
// everywhere) the Kbd name is kept, so its spoken label ("Command + K")
// survives. Each part is one keycap: Kbd shows a literal symbol as is.
export function kbdKeys(
  keys: string,
  isMac: boolean = isMacPlatform(),
): string {
  return keyParts(keys)
    .map((k) => (isMac ? k : (modifierSymbol(k, false) ?? k)))
    .join("+");
}

const KEY_TEXT: Record<string, string> = {
  enter: "↵",
  tab: "⇥",
  backspace: "⌫",
  escape: "Esc",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  plus: "+",
};

// A shortcut as text, for tooltips and other strings, with the same symbols
// `kbdKeys` gives the badges: "⌃K" on Linux/Windows, "⌘K" on macOS, "⌃↵"
// for mod+enter. Single-character keys run together; a longer one ("Esc",
// "Alt" off macOS) joins with "+".
export function formatShortcut(
  keys: string,
  isMac: boolean = isMacPlatform(),
): string {
  const parts = keyParts(keys).map(
    (k) =>
      modifierSymbol(k, isMac) ??
      KEY_TEXT[k] ??
      (k === "alt" ? "Alt" : k.length === 1 ? k.toUpperCase() : k),
  );
  return parts.join(parts.every((p) => p.length === 1) ? "" : "+");
}

// "Toggle side panel (⌃J)", for a button's tooltip.
export function withShortcut(label: string, id: ShortcutId): string {
  return `${label} (${formatShortcut(SHORTCUTS[id].keys)})`;
}

// For xterm's `attachCustomKeyEventHandler`: false hands the palette
// shortcut back to the page instead of the shell, which would otherwise
// swallow it (Ctrl+K is kill-line there).
export function terminalKeyFilter(e: KeyboardEvent): boolean {
  return !Object.values(SHORTCUTS).some(
    (s) => s.isAllowedInEditor && matchesShortcut(e, s.keys, isMacPlatform()),
  );
}
