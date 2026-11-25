import * as stylex from "@stylexjs/stylex";
import logoUrl from "../assets/logo.svg";

const styles = stylex.create({
  logo: {
    display: "block",
    width: "auto",
    flexShrink: 0,
  },
  // Heights in em, so the wordmark follows the surrounding text size.
  sm: { height: "0.875em" },
  md: { height: "1.25em" },
  lg: { height: "3.5em" },
});

// A static asset (`src/assets/logo.svg`), not live text — its viewBox was
// computed once from the actual glyph outlines (extracted from Noto Sans
// Bold via fontTools, tightly wrapping the real rendered shapes with no
// leftover space on any side), then baked in as vector paths. This is what
// fixing the root issue actually meant: a hand-picked or runtime-measured
// text-based viewBox still depends on whatever font the platform resolves
// "ui-sans-serif" to — a real logo shouldn't vary with that, so it's no
// longer text at all.
export default function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <img
      src={logoUrl}
      alt="ai leash"
      {...stylex.props(styles.logo, styles[size])}
    />
  );
}
