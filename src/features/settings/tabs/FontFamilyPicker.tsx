import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { api } from "../../../lib/tauriApi";

// A family name as a CSS `font-family` entry — always quoted, so names with
// spaces or digits ("Fira Code", "3270") are valid.
function cssFamily(name: string): string {
  return `"${name.replace(/["\\]/g, "\\$&")}"`;
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
  // The highlighted row, previewed in its own typeface — rendering every row
  // in its own font would load hundreds of them at once.
  const [highlighted, setHighlighted] = useState("");
  const { data: fonts, isPending } = useQuery({
    queryKey: ["system-fonts"],
    queryFn: api.listSystemFonts,
    enabled: open,
    // Installing a font mid-session is rare; a restart picks it up.
    staleTime: Number.POSITIVE_INFINITY,
  });

  const mono = monospaceFirst ? (fonts ?? []).filter((f) => f.monospaced) : [];
  const rest = monospaceFirst
    ? (fonts ?? []).filter((f) => !f.monospaced)
    : (fonts ?? []);

  function renderItem(family: string) {
    return (
      <CommandItem
        key={family}
        value={family}
        onSelect={() => {
          onPick(cssFamily(family));
          setOpen(false);
        }}
      >
        {family}
      </CommandItem>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="chip"
          bordered
          size="sm"
          title="Pick an installed font"
        >
          Browse
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <Command
          className="h-auto"
          value={highlighted}
          onValueChange={setHighlighted}
        >
          <CommandInput placeholder="Search installed fonts..." />
          <CommandList>
            {isPending ? (
              <div className="py-6 text-center text-sm text-zinc-500">
                Loading fonts...
              </div>
            ) : (
              <>
                <CommandEmpty>No matching fonts.</CommandEmpty>
                {mono.length > 0 && (
                  <CommandGroup heading="Monospace">
                    {mono.map((f) => renderItem(f.family))}
                  </CommandGroup>
                )}
                <CommandGroup heading={monospaceFirst ? "Other" : undefined}>
                  {rest.map((f) => renderItem(f.family))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          {highlighted && (
            <div
              className="truncate border-t border-border px-3 py-2 text-sm text-zinc-300"
              style={{ fontFamily: `${cssFamily(highlighted)}, sans-serif` }}
            >
              The quick brown fox jumps over the lazy dog
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
