// The app's global keyboard shortcuts, in one place: what each key does,
// how it's matched against a keydown, and how it's shown. `keys` is in the
// format Astryx's `Kbd` takes (`mod` is Command on macOS and Ctrl elsewhere),
// so the same string feeds the palette's key badges, the tooltips
// (`formatShortcut`) and the matcher. `useShortcuts`
// (`hooks/useShortcuts.ts`) is the one document listener that runs them.

export type ShortcutId =
  | "palette"
  | "newThread"
  | "toggleSidebar"
  | "toggleSidePanel"
  | "settings"
  | "openFiles"
  | "openTerminal"
  | "openSubAgents"
  | "openActions";

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

function parseKeys(keys: string): ParsedKeys {
  const parts = keys.toLowerCase().split("+");
  return {
    mod: parts.includes("mod"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    key: parts[parts.length - 1],
  };
}

// The physical key, for layouts where `e.key` isn't the Latin letter.
function codeFor(key: string): string | null {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (key === ",") return "Comma";
  return null;
}

// `mod` is Command alone on macOS and Ctrl alone elsewhere; Shift and Alt
// must match exactly, so Ctrl+Shift+K isn't Ctrl+K.
export function matchesShortcut(
  e: KeyLike,
  keys: string,
  isMac: boolean,
): boolean {
  const want = parseKeys(keys);
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

// The shortcut a keydown triggers, or null — none matched, or the focus
// guard skipped it.
export function shortcutForEvent(
  e: KeyLike & { target: EventTarget | null },
  isMac: boolean,
): Shortcut | null {
  const match = Object.values(SHORTCUTS).find((s) =>
    matchesShortcut(e, s.keys, isMac),
  );
  if (!match) return null;
  if (!match.isAllowedInEditor && isInTerminalOrEditor(e.target)) return null;
  return match;
}

// A shortcut as text, for tooltips: "Ctrl+K" elsewhere, "⌘K" on macOS.
export function formatShortcut(keys: string, isMac: boolean): string {
  const { mod, shift, alt, key } = parseKeys(keys);
  const name = key.length === 1 ? key.toUpperCase() : key;
  if (isMac) {
    return `${mod ? "⌘" : ""}${alt ? "⌥" : ""}${shift ? "⇧" : ""}${name}`;
  }
  return [mod && "Ctrl", alt && "Alt", shift && "Shift", name]
    .filter(Boolean)
    .join("+");
}

// "Toggle side panel (Ctrl+J)", for a button's tooltip.
export function withShortcut(label: string, id: ShortcutId): string {
  return `${label} (${formatShortcut(SHORTCUTS[id].keys, isMacPlatform())})`;
}

// For xterm's `attachCustomKeyEventHandler`: false hands the palette
// shortcut back to the page instead of the shell, which would otherwise
// swallow it (Ctrl+K is kill-line there).
export function terminalKeyFilter(e: KeyboardEvent): boolean {
  return !Object.values(SHORTCUTS).some(
    (s) => s.isAllowedInEditor && matchesShortcut(e, s.keys, isMacPlatform()),
  );
}
