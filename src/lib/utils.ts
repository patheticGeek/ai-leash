import { extendTailwindMerge } from "tailwind-merge";

// `text-code` (see `index.css`) is a font size, but tailwind-merge would
// read it as a text colour and drop it next to `text-red-300` and the like.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": ["text-code"] } },
});

export function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(inputs.filter(Boolean).join(" "));
}
