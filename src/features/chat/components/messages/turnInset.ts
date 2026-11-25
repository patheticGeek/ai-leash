import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";

// One left edge for an agent turn. A ghost bubble keeps the filled bubble's
// inline padding (--spacing-4 at the transcript's balanced and compact
// densities), so a reply's text starts that far in from the message edge.
// Everything else in the turn — its `ChatToolCalls` rows (activity groups,
// the Worked-for row) and its metadata lines (time/copy, Working for) — is
// inset by the same step so its icon and label start at the reply text.
export const turnInset = stylex.create({
  inset: { paddingInline: spacingVars["--spacing-4"] },
});
