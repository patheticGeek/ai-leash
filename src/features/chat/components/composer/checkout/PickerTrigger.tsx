import { Button } from "@astryxdesign/core/Button";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, type LucideIcon } from "lucide-react";

const styles = stylex.create({
  // A long worktree / branch name truncates instead of pushing the other
  // picker off the bar.
  trigger: {
    maxWidth: "20rem",
    minWidth: 0,
    // The bar sits over the transcript fading out under the composer
    // (`ChatComposer`'s `fadeTail`): a frosted surface backdrop, like
    // `ChatLayout`'s dock layer, keeps the name readable over messages
    // passing beneath. Button's hover and press fills are a background-image
    // layer over this colour, so they still show.
    backgroundColor: `color-mix(in srgb, ${colorVars["--color-background-surface"]} 85%, transparent)`,
    backdropFilter: `blur(${spacingVars["--spacing-3"]})`,
  },
});

// The checkout bar's ghost picker button: icon, the current name, a chevron.
// Spread with whatever the wrapping `Popover` passes its trigger.
export default function PickerTrigger({
  icon: IconComponent,
  label,
  name,
  isDisabled,
  tooltip,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  name: string;
  isDisabled?: boolean;
  tooltip?: string;
}) {
  return (
    <Button
      {...rest}
      variant="ghost"
      size="sm"
      label={`${label}: ${name}`}
      icon={<IconComponent size={14} />}
      endContent={<ChevronDown size={14} />}
      isDisabled={isDisabled}
      tooltip={tooltip}
      xstyle={styles.trigger}
    >
      {name}
    </Button>
  );
}
