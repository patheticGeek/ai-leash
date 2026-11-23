// The leash theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in leash.settings.json and the generated leash.settings.ts;
// change them with `astryx experimental theme editor set leash ...`. Add your own changes below: they win over the settings.
import { defineTheme } from "@astryxdesign/core/theme";
import { leashSettings } from "./leash.settings";

const tokenVar = (token: string) => `var(${token})`;

// A ghost-style Button that takes a status color on hover: no fill at rest,
// the status's muted fill and text color under the pointer.
const hoverTinted = (status: "error" | "success") => ({
  backgroundColor: "transparent",
  color: tokenVar("--color-text-secondary"),
  ":hover": {
    backgroundColor: tokenVar(`--color-${status}-muted`),
    backgroundImage: "none",
    color: tokenVar(`--color-text-${status}`),
  },
});

// A toolbar chip tinted for a state it is currently in (sending, bypassing
// permissions, a toggle that is on): the status's muted fill and text color.
const chipTinted = (fill: string, text: string) => ({
  backgroundColor: tokenVar(fill),
  color: tokenVar(text),
});

export const leashTheme = defineTheme({
  extends: leashSettings,
  name: "leash",
  // Button variants the editor can't add (it only tunes the built-in
  // primary/secondary/ghost/destructive). `npx astryx theme build` turns
  // these into `ButtonVariantMap` augmentations in leash.variants.d.ts.
  components: {
    button: {
      // Dimmer than `ghost` and brightens on hover without a fill — for
      // secondary icon actions (copy, retry, close tab, clear) that shouldn't
      // compete with the primary controls around them.
      "variant:quiet": {
        backgroundColor: "transparent",
        color: tokenVar("--color-text-secondary"),
        ":hover": {
          backgroundImage: "none",
          color: tokenVar("--color-text-primary"),
        },
      },
      // Row actions that delete / approve something: quiet at rest so a list
      // of them doesn't shout, red / green only once pointed at.
      "variant:danger": hoverTinted("error"),
      "variant:success": hoverTinted("success"),
      // Popover/dropdown trigger pill in a toolbar (model, effort and
      // permission pickers) and toolbar toggles in their "off" state.
      "variant:chip": {
        backgroundColor: tokenVar("--color-overlay-hover"),
        color: tokenVar("--color-text-secondary"),
        ":hover": { color: tokenVar("--color-text-primary") },
      },
      "variant:chip-primary": chipTinted(
        "--color-accent-muted",
        "--color-text-accent",
      ),
      "variant:chip-danger": chipTinted(
        "--color-error-muted",
        "--color-text-error",
      ),
      "variant:chip-warning": chipTinted(
        "--color-warning-muted",
        "--color-text-warning",
      ),
      "variant:chip-success": chipTinted(
        "--color-success-muted",
        "--color-text-success",
      ),
    },
  },
});
