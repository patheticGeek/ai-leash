import { extendTailwindMerge } from "tailwind-merge";

// `text-code` (see `index.css`) is a font size, but tailwind-merge would
// read it as a text colour and drop it next to `text-red-300` and the like.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": ["text-code"] } },
});

export function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(inputs.filter(Boolean).join(" "));
}

// Shared by row actions that only appear on hover of their nearest ancestor
// `.group` (delete/edit buttons). Needs a *named* group (`group-hover/name:`)
// instead? Compose your own className — this only covers the common case.
export const revealOnGroupHover = "shrink-0 opacity-0 group-hover:opacity-100";
