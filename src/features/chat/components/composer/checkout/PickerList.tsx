import type { ReactNode } from "react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/ui/command";

// The searchable list view shared by both checkout pickers, with an optional
// pinned "New …" row (omit `createLabel` for a read-only list).
export default function PickerList({
  searchPlaceholder,
  createLabel,
  createValue,
  onCreate,
  children,
}: {
  searchPlaceholder: string;
  createLabel?: string;
  // What `cmdk` matches the search query against for the create row.
  createValue: string;
  onCreate: () => void;
  children: ReactNode;
}) {
  return (
    <Command className="gap-0 rounded-none! bg-transparent p-0">
      <CommandInput placeholder={searchPlaceholder} autoFocus />
      <CommandList className="max-h-80 px-1 pt-1">
        <CommandEmpty className="px-2 py-3 text-sm text-zinc-600">
          No matches.
        </CommandEmpty>
        {createLabel && (
          <CommandItem
            value={createValue}
            forceMount
            onSelect={onCreate}
            className="h-9 cursor-pointer border-t border-white/5 bg-popover text-zinc-200"
          >
            {createLabel}
          </CommandItem>
        )}
        {children}
      </CommandList>
    </Command>
  );
}
