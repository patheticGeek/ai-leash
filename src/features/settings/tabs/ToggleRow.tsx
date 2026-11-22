import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import {
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  // Same tinted block as `SettingsRow`; the whole row is the checkbox's label.
  row: {
    backgroundColor: colorVars["--color-background-muted"],
    borderRadius: radiusVars["--radius-element"],
    paddingBlock: spacingVars["--spacing-3"],
    paddingInline: spacingVars["--spacing-4"],
  },
});

export default function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <CheckboxInput
      label={label}
      description={hint}
      size="sm"
      value={checked}
      onChange={onChange}
      width="100%"
      xstyle={styles.row}
    />
  );
}
