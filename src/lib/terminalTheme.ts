import type { ITheme } from "@xterm/xterm";

// xterm.js takes a plain color object, not CSS — kept in sync with
// --al-bg-sunken by hand since it can't read the CSS custom property.
export const terminalTheme: ITheme = {
  background: "#0b0c0e",
  foreground: "#d4d4d8",
  cursor: "#d4d4d8",
};
