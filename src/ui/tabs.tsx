import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
        // A full-width, scrollable row of pill tabs (the centre/side panel
        // headers) — pair with `TabsTrigger`'s `onClose` for closable tabs.
        strip:
          "w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 px-1.5",
      },
      // Sets the list's height when horizontal; the triggers' padding/text
      // follow via `group-data-[size=…]/tabs-list` on `TabsTrigger` below.
      size: {
        sm: "group-data-horizontal/tabs:h-8",
        md: "group-data-horizontal/tabs:h-10",
        lg: "group-data-horizontal/tabs:h-12",
      },
    },
    compoundVariants: [
      { variant: "strip", class: "group-data-horizontal/tabs:h-12" },
    ],
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  },
);

// Lets each `TabsTrigger` pick up its list's variant/size, so the trigger's
// own classes are merged deterministically (tailwind-merge) rather than
// fighting `group-data-[…]/tabs-list:` selectors over CSS order.
const TabsListContext = React.createContext<
  Required<VariantProps<typeof tabsListVariants>>
>({ variant: "default", size: "sm" });

function TabsList({
  className,
  variant = "default",
  size = "sm",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const context = React.useMemo(
    () => ({ variant: variant ?? "default", size: size ?? "sm" }),
    [variant, size],
  );
  return (
    <TabsListContext.Provider value={context}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        data-size={size}
        className={cn(tabsListVariants({ variant, size }), className)}
        {...props}
      />
    </TabsListContext.Provider>
  );
}

const tabsTriggerVariants = cva(
  [
    "relative inline-flex cursor-pointer h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-zinc-400 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:bg-white/5 hover:text-zinc-200 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "data-active:bg-border data-active:text-zinc-100",
    "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
  ],
  {
    variants: {
      variant: {
        default: "",
        line: "bg-transparent data-active:bg-transparent data-active:border-transparent",
        strip:
          "h-auto flex-none px-2 py-1.5 text-xs font-normal text-zinc-500 duration-150 ease-out hover:bg-transparent hover:text-zinc-300 data-active:bg-white/10 data-active:text-zinc-100",
      },
      size: {
        sm: "",
        md: "px-2.5 py-1.5",
        lg: "px-3 py-2 text-base [&_svg:not([class*='size-'])]:size-5",
      },
    },
    compoundVariants: [
      // The strip is one fixed look regardless of the list's size.
      {
        variant: "strip",
        size: ["sm", "md", "lg"],
        class: "px-2 py-1.5 text-xs",
      },
    ],
    defaultVariants: { variant: "default", size: "sm" },
  },
);

interface TabsTriggerProps
  extends React.ComponentProps<typeof TabsPrimitive.Trigger> {
  /** Adds a close button beside the label (rendered as a sibling, not nested — a button can't contain a button). */
  onClose?: () => void;
  closeLabel?: string;
}

function TabsTrigger({
  className,
  onClose,
  closeLabel = "Close tab",
  ...props
}: TabsTriggerProps) {
  const { variant, size } = React.useContext(TabsListContext);
  const trigger = (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        tabsTriggerVariants({ variant, size }),
        onClose && "pr-7 group-hover/tab:text-zinc-300",
        className,
      )}
      {...props}
    />
  );
  if (!onClose) return trigger;
  return (
    <div
      data-slot="tabs-tab"
      className="group/tab relative inline-flex shrink-0 items-center"
    >
      {trigger}
      <Button
        variant="quiet"
        size="icon-sm"
        title={closeLabel}
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute top-1/2 right-0.5 -translate-y-1/2"
      >
        <X size={12} />
      </Button>
    </div>
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  tabsListVariants,
  tabsTriggerVariants,
};
