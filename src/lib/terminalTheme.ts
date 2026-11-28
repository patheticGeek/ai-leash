import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { ITheme } from "@xterm/xterm";

// The terminal looks like the Astryx code block (the ide template's
// borderless drawer `CodeBlock`): the theme's code background and primary
// text. The syntax tokens are theme CSS variables without a StyleX export,
// hence the plain `var()` for the background.
const BACKGROUND = "var(--color-syntax-background)";
const FOREGROUND = colorVars["--color-text-primary"];

export const terminalStyles = stylex.create({
  // The xterm host: fills its tab, inset like a code block's body.
  host: {
    height: "100%",
    minHeight: 0,
    boxSizing: "border-box",
    backgroundColor: BACKGROUND,
    paddingBlock: spacingVars["--spacing-2"],
    paddingInline: spacingVars["--spacing-3"],
  },
});

// The 16 ANSI colours, from the same syntax palette as code blocks and the
// editor (`lib/codeTheme.ts`), so a test run's red and green, or a prompt's
// blue, match the code next to it. Bright variants share the base colour; the
// palette has one shade per hue.
const syntax = (name: string) => `var(--color-syntax-${name})`;
const ANSI = {
  black: colorVars["--color-background-card"],
  red: syntax("tag"),
  green: syntax("string"),
  yellow: syntax("attribute"),
  blue: syntax("function"),
  magenta: syntax("keyword"),
  cyan: syntax("property"),
  white: syntax("variable"),
  brightBlack: colorVars["--color-text-disabled"],
  brightRed: syntax("tag"),
  brightGreen: syntax("string"),
  brightYellow: syntax("attribute"),
  brightBlue: syntax("function"),
  brightMagenta: syntax("keyword"),
  brightCyan: syntax("property"),
  brightWhite: colorVars["--color-text-primary"],
} satisfies Partial<ITheme>;

// xterm.js takes concrete colors, not CSS — so resolve the same tokens the
// host is painted with, through a probe element inside `host` (the theme's
// values are `light-dark(...)`, which only a computed style resolves).
export function terminalTheme(host: HTMLElement): ITheme {
  const probe = document.createElement("span");
  host.appendChild(probe);
  const resolve = (value: string) => {
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const foreground = resolve(FOREGROUND);
  const theme: ITheme = {
    background: resolve(BACKGROUND),
    foreground,
    cursor: foreground,
    cursorAccent: resolve(BACKGROUND),
    selectionBackground: resolve(colorVars["--color-accent-muted"]),
  };
  for (const [name, value] of Object.entries(ANSI)) {
    theme[name as keyof typeof ANSI] = resolve(value);
  }
  probe.remove();
  return theme;
}
