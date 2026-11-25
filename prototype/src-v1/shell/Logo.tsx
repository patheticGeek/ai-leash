import * as stylex from "@stylexjs/stylex";
import logoUrl from "../assets/logo.svg";

// Same as the app's src/ui/Logo.tsx: the wordmark is a static asset.
const styles = stylex.create({
  logo: { display: "block", width: "auto", flexShrink: 0 },
  sm: { height: "0.95em" },
  lg: { height: "3.5em" },
});

export default function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <img
      src={logoUrl}
      alt="ai leash"
      {...stylex.props(styles.logo, styles[size])}
    />
  );
}
