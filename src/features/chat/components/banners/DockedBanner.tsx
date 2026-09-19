import type * as React from "react";
import { cn } from "@/lib/utils";
import { Alert } from "@/ui/alert";

type DockSide = "top" | "bottom";

// The classes that tuck a strip against `ChatInputBar`'s box. That box has
// `px-3 py-4` around it, so a strip is inset narrower than the box (`mx-7`)
// and pulled into the box's vertical padding (`-mb-4` above it, `-mt-3.5`
// below it) until its flat edge meets the box. The coupling to that padding
// lives here and nowhere else — exported for `HelpBanner`, whose panel isn't
// an `Alert` but docks the same way.
export function dockClassName(side: DockSide): string {
  return cn(
    "z-10 mx-10 ",
    side === "top" ? "rounded-b-none" : "rounded-t-none",
  );
}

// An `Alert` docked against the message box: `side="top"` sits above it
// (rate-limit notice, queued messages), `side="bottom"` below (the checkout
// bar). Takes the `Alert`'s `variant`/`outline` and children as-is.
export default function DockedBanner({
  side = "top",
  ...props
}: React.ComponentProps<typeof Alert> & { side?: DockSide }) {
  return (
    <div className={dockClassName(side)}>
      <Alert {...props} />
    </div>
  );
}
