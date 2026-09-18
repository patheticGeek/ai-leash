import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check, Copy, Play, Send, Square, Trash2, X } from "lucide-react";
import { Button, type buttonVariants, revealOnGroupHover } from "./button";

type Variant = NonNullable<Parameters<typeof buttonVariants>[0]>["variant"];
type Size = NonNullable<Parameters<typeof buttonVariants>[0]>["size"];

const VARIANTS: NonNullable<Variant>[] = [
  "default",
  "primary",
  "outline",
  "secondary",
  "ghost",
  "quiet",
  "danger",
  "destructive",
  "link",
  "chip",
  "chip-primary",
  "chip-danger",
  "chip-warning",
  "menu-item",
  "card",
  "unstyled",
];
const SIZES: NonNullable<Size>[] = [
  "md",
  "sm",
  "xs",
  "icon",
  "icon-sm",
  "icon-lg",
  "none",
];

const meta = {
  title: "UI/Button",
  component: Button,
  args: { children: "Button" },
  argTypes: {
    variant: { control: "select", options: VARIANTS },
    size: { control: "select", options: SIZES },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { variant: "secondary", size: "md" },
};

export const Variants: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="grid grid-cols-[8rem_repeat(2,auto)] items-center gap-x-6 gap-y-3">
      <span className="text-xs text-muted-foreground">variant</span>
      <span className="text-xs text-muted-foreground">enabled</span>
      <span className="text-xs text-muted-foreground">disabled</span>
      {VARIANTS.map((variant) => (
        <div key={variant} className="contents">
          <code className="text-xs text-muted-foreground">{variant}</code>
          <div className="w-56">
            <Button variant={variant} size="sm">
              {variant}
            </Button>
          </div>
          <div className="w-56">
            <Button variant={variant} size="sm" disabled>
              {variant}
            </Button>
          </div>
        </div>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {SIZES.map((size) => {
        const icon = size.startsWith("icon");
        return (
          <div key={size} className="flex items-center gap-4">
            <code className="w-16 text-xs text-muted-foreground">{size}</code>
            <Button variant="primary" size={size}>
              {icon ? <Play /> : "Label"}
            </Button>
            <Button variant="ghost" size={size}>
              {icon ? <X /> : "Label"}
            </Button>
          </div>
        );
      })}
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button variant="primary" size="md">
        <Check /> Approve
      </Button>
      <Button variant="ghost" size="md">
        <X /> Deny
      </Button>
      <Button variant="danger" size="md">
        <Trash2 /> Delete
      </Button>
    </div>
  ),
};

export const IconActions: Story = {
  name: "Icon actions (ghost / quiet / danger)",
  render: () => (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon-sm" title="ghost">
        <Copy />
      </Button>
      <Button variant="quiet" size="icon-sm" title="quiet">
        <Copy />
      </Button>
      <Button variant="danger" size="icon-sm" title="danger">
        <Trash2 />
      </Button>
    </div>
  ),
};

export const ChipStates: Story = {
  name: "Chip states (send / stop / bypass) × bordered",
  render: () => {
    const chips = [
      { variant: "chip", label: "Queue", icon: <Play size={12} /> },
      { variant: "chip-primary", label: "Send", icon: <Send size={14} /> },
      {
        variant: "chip-danger",
        label: "Stop",
        icon: <Square size={12} fill="currentColor" />,
      },
      {
        variant: "chip-warning",
        label: "Bypass",
        icon: <Square size={11} />,
      },
    ] as const;
    return (
      <div className="grid grid-cols-[6rem_auto_auto] items-center gap-x-6 gap-y-3">
        <span />
        <span className="text-xs text-muted-foreground">bordered</span>
        <span className="text-xs text-muted-foreground">no border</span>
        {chips.map(({ variant, label, icon }) => (
          <div key={variant} className="contents">
            <code className="text-xs text-muted-foreground">{variant}</code>
            {[true, false].map((bordered) => (
              <div key={String(bordered)}>
                <Button variant={variant} bordered={bordered} size="xs">
                  {icon} {label}
                </Button>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  },
};

export const MenuItems: Story = {
  name: "Menu items (data-active marks the selected row)",
  render: () => (
    <div className="w-56 rounded-md bg-popover py-1 shadow-[var(--al-shadow)]">
      {["Sonnet", "Opus", "Haiku"].map((label, i) => (
        <Button
          key={label}
          variant="menu-item"
          size="none"
          data-active={i === 1}
        >
          <div className="text-sm font-medium text-zinc-100">{label}</div>
        </Button>
      ))}
    </div>
  ),
};

export const Card: Story = {
  render: () => (
    <Button variant="card" size="none" className="w-44">
      <span className="text-sm text-zinc-200">Terminal</span>
      <span className="text-[11px] text-zinc-600">Open a shell</span>
    </Button>
  ),
};

export const RevealOnHover: Story = {
  name: "revealOnGroupHover (row actions)",
  render: () => (
    <div className="group flex w-64 items-center justify-between rounded-md bg-card px-3 py-2 shadow-[var(--al-shadow)]">
      <span className="text-sm">Hover this row</span>
      <Button
        variant="danger"
        size="icon-sm"
        className={revealOnGroupHover}
        title="Delete"
      >
        <Trash2 />
      </Button>
    </div>
  ),
};
