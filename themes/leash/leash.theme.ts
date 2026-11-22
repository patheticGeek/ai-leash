// The leash theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in leash.settings.json and the generated leash.settings.ts;
// change them with `astryx experimental theme editor set leash ...`. Add your own changes below: they win over the settings.
import { defineTheme } from "@astryxdesign/core/theme";
import { leashSettings } from "./leash.settings";

export const leashTheme = defineTheme({
  extends: leashSettings,
  name: "leash",
});
