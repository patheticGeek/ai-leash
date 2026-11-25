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
  const background = resolve(BACKGROUND);
  const foreground = resolve(FOREGROUND);
  probe.remove();
  return { background, foreground, cursor: foreground };
}
