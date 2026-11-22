import { Button } from "@astryxdesign/core/Button";
import {
  CommandPalette,
  CommandPaletteFooter,
  CommandPaletteInput,
  useCommandPaletteContext,
} from "@astryxdesign/core/CommandPalette";
import { Popover } from "@astryxdesign/core/Popover";
import { Text } from "@astryxdesign/core/Text";
import {
  createStaticSource,
  type SearchableItem,
} from "@astryxdesign/core/Typeahead";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { qk } from "@/data/keys";
import { api } from "../../../lib/tauriApi";

// A family name as a CSS `font-family` entry — always quoted, so names with
// spaces or digits ("Fira Code", "3270") are valid.
function cssFamily(name: string): string {
  return `"${name.replace(/["\\]/g, "\\$&")}"`;
}

const styles = stylex.create({
  preview: (fontFamily: string) => ({ fontFamily }),
});

// The highlighted row, previewed in its own typeface below the list —
// rendering every row in its own font would load hundreds of them at once.
function HighlightedPreview() {
  const palette = useCommandPaletteContext();
  const family =
    palette?.selectableItems[palette.highlightedIndex]?.value ?? null;
  if (!family) return null;
  return (
    <CommandPaletteFooter>
      <Text
        maxLines={1}
        xstyle={styles.preview(`${cssFamily(family)}, sans-serif`)}
      >
        The quick brown fox jumps over the lazy dog
      </Text>
    </CommandPaletteFooter>
  );
}

// Browse-and-pick for the installed fonts. Picking replaces the whole family
// field with that one font; the field itself stays free-form for lists.
export default function FontFamilyPicker({
  monospaceFirst,
  onPick,
}: {
  // Code fonts: list the monospaced families up front, the rest below.
  monospaceFirst: boolean;
  onPick: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: fonts, isPending } = useQuery({
    queryKey: qk.systemFonts,
    queryFn: api.listSystemFonts,
    enabled: open,
    // Installing a font mid-session is rare; a restart picks it up.
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Code fonts list the monospaced families up front (a "Monospace" group),
  // the rest below ("Other"); otherwise one ungrouped list.
  const searchSource = useMemo(() => {
    const items: SearchableItem<{ group: string }>[] = (fonts ?? []).map(
      (f) => ({
        id: f.family,
        label: f.family,
        auxiliaryData: monospaceFirst
          ? { group: f.monospaced ? "Monospace" : "Other" }
          : undefined,
      }),
    );
    if (monospaceFirst) {
      items.sort(
        (a, b) =>
          Number(a.auxiliaryData?.group === "Other") -
          Number(b.auxiliaryData?.group === "Other"),
      );
    }
    return createStaticSource(items);
  }, [fonts, monospaceFirst]);

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      label="Installed fonts"
      placement="below"
      alignment="end"
      width="20rem"
      padding={0}
      content={
        <CommandPalette
          isInline
          isOpen={open}
          onOpenChange={setOpen}
          label="Installed fonts"
          width="100%"
          maxHeight="24rem"
          searchSource={searchSource}
          value=""
          onValueChange={(family) => {
            if (family) onPick(cssFamily(family));
          }}
          input={
            // The popover moves focus here when it opens; the closed
            // popover stays mounted, so the input mustn't autofocus itself.
            <CommandPaletteInput
              placeholder="Search installed fonts..."
              hasAutoFocus={false}
            />
          }
          emptySearchText="No matching fonts."
          emptyBootstrapText={
            isPending ? "Loading fonts..." : "No fonts found."
          }
          footer={<HighlightedPreview />}
        />
      }
    >
      <Button
        variant="secondary"
        size="sm"
        label="Browse"
        tooltip="Pick an installed font"
      />
    </Popover>
  );
}
