// Keys for the prompts an agent shows when it needs the user — the
// permission ask and the agent's question (`PermissionPrompt`,
// `ElicitationPrompt`, both on `PromptCard`). Kept apart from the components
// so the mapping has no React or DOM in it and can be tested on plain
// objects.
//
// One scheme for every prompt:
// - number keys 1–9 pick the options (or a question's choices) in the order
//   they're shown, each with its `Kbd` badge;
// - Enter takes the primary option (allow once / next / submit);
// - Escape says no (deny / decline);
// - `[` and `]` step through several pending prompts.
//
// The prompt's own `onKeyDown` runs this, so keys only act while focus is
// inside a prompt — never on the user's typing elsewhere. Inside the prompt,
// a text field keeps every character key (numbers and brackets type), and
// only Enter and Escape act there; Enter on a button is left to the button.

export type PromptKeyAction =
  | { type: "option"; index: number }
  | { type: "primary" }
  | { type: "refuse" }
  | { type: "previous" }
  | { type: "next" };

// The keydown fields the mapping reads, so tests can pass plain objects.
export interface PromptKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
}

// The focused element's fields that matter, read off the event target.
export interface PromptKeyTarget {
  tagName?: string;
  type?: string;
  role?: string | null;
  isContentEditable?: boolean;
}

export interface PromptKeyContext {
  target: PromptKeyTarget | null;
  // How many numbered options the prompt shows right now (at most 9 get a
  // key).
  optionCount: number;
  // How many prompts are waiting; `[`/`]` only act with more than one.
  queueLength: number;
}

// Input types that take typed text. A checkbox or radio input is a choice,
// not a text field.
const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
]);

const TEXT_ROLES = new Set(["textbox", "searchbox", "spinbutton", "combobox"]);

// Roles whose own Enter/Space activation must not be doubled up.
const ACTIVATING_ROLES = new Set(["button", "link", "menuitem", "tab"]);

// Focus where a character key types text.
export function isTextEntryTarget(target: PromptKeyTarget | null): boolean {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  if (target.role && TEXT_ROLES.has(target.role)) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    return TEXT_INPUT_TYPES.has((target.type ?? "").toLowerCase());
  }
  return false;
}

// Focus on something Enter already activates (a button, a link).
export function isActivatingTarget(target: PromptKeyTarget | null): boolean {
  if (!target) return false;
  if (target.role) return ACTIVATING_ROLES.has(target.role);
  const tag = (target.tagName ?? "").toUpperCase();
  return tag === "BUTTON" || tag === "A";
}

export const MAX_NUMBERED_OPTIONS = 9;

// The key that picks option `index` (0-based), or null past the ninth.
export function optionKey(index: number): string | null {
  return index >= 0 && index < MAX_NUMBERED_OPTIONS ? String(index + 1) : null;
}

// What a keydown inside a prompt does, or null to leave it alone.
export function promptKeyAction(
  e: PromptKeyEvent,
  ctx: PromptKeyContext,
): PromptKeyAction | null {
  // Something inside (an open date picker) already handled it; an IME is
  // mid-composition; or a modifier makes it some other shortcut.
  if (e.defaultPrevented || e.isComposing) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;

  if (e.key === "Escape") return { type: "refuse" };

  if (e.key === "Enter") {
    // A held Enter from the message the user was sending must not run on.
    if (e.repeat || e.shiftKey) return null;
    if (isActivatingTarget(ctx.target)) return null;
    return { type: "primary" };
  }

  // Everything below is a character: it types in a text field.
  if (isTextEntryTarget(ctx.target) || e.repeat) return null;

  if (/^[1-9]$/.test(e.key)) {
    const index = Number(e.key) - 1;
    return index < ctx.optionCount ? { type: "option", index } : null;
  }
  if (ctx.queueLength > 1) {
    if (e.key === "[") return { type: "previous" };
    if (e.key === "]") return { type: "next" };
  }
  return null;
}

// The pending prompt on screen: the one the user stepped to, or the oldest
// if that one's gone (answered, or resolved elsewhere).
export function currentPromptIndex(
  ids: readonly string[],
  selectedId: string | null,
): number {
  if (selectedId === null) return 0;
  const i = ids.indexOf(selectedId);
  return i < 0 ? 0 : i;
}

// Stepping through pending prompts wraps around both ends.
export function stepPromptIndex(
  index: number,
  length: number,
  delta: 1 | -1,
): number {
  if (length <= 0) return 0;
  return (index + delta + length) % length;
}

// A long command or diff, cut to its first `maxLines` lines until the user
// asks for the rest.
export function truncateLines(
  text: string,
  maxLines: number,
): { text: string; hiddenLines: number } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, hiddenLines: 0 };
  return {
    text: lines.slice(0, maxLines).join("\n"),
    hiddenLines: lines.length - maxLines,
  };
}

// `PromptKeyTarget` from a real event target.
export function promptKeyTarget(
  target: EventTarget | null,
): PromptKeyTarget | null {
  if (!target || typeof (target as Element).getAttribute !== "function") {
    return null;
  }
  const el = target as HTMLElement & { type?: string };
  return {
    tagName: el.tagName,
    type: typeof el.type === "string" ? el.type : undefined,
    role: el.getAttribute("role"),
    isContentEditable: el.isContentEditable,
  };
}
