import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

const VARIANTS = [
  "default",
  "secondary",
  "muted",
  "success",
  "warning",
  "danger",
] as const;

const SIZES = ["default", "sm", "count"] as const;

const meta = {
  title: "UI/Badge",
  component: Badge,
  args: { children: "Badge" },
  argTypes: {
    variant: { control: "select", options: VARIANTS },
    size: { control: "inline-radio", options: SIZES },
    outline: { control: "boolean" },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { args: { variant: "default" } };

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {[false, true].map((outline) => (
        <div key={String(outline)} className="flex items-center gap-2">
          {VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant} outline={outline}>
              {variant}
            </Badge>
          ))}
        </div>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      {SIZES.map((size) => (
        <Badge key={size} size={size} variant="warning" outline>
          {size === "count" ? 3 : size}
        </Badge>
      ))}
    </div>
  ),
};

export const StatusPills: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Badge size="sm" variant="warning" outline>
        running…
      </Badge>
      <Badge size="sm" variant="success" outline>
        done
      </Badge>
      <Badge size="sm" variant="danger" outline>
        error
      </Badge>
      <Badge size="sm" variant="muted" outline>
        stopped
      </Badge>
    </div>
  ),
};
