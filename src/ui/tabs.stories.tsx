import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  argTypes: {
    orientation: {
      control: "inline-radio",
      options: ["horizontal", "vertical"],
    },
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({
  variant,
  size,
  orientation,
}: {
  variant: "default" | "line";
  size?: "sm" | "md" | "lg";
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <Tabs defaultValue="general" orientation={orientation} className="w-80">
      <TabsList variant={variant} size={size}>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="agents">Agents</TabsTrigger>
        <TabsTrigger value="about">About</TabsTrigger>
      </TabsList>
      <TabsContent value="general">General settings.</TabsContent>
      <TabsContent value="agents">Agent settings.</TabsContent>
      <TabsContent value="about">About this app.</TabsContent>
    </Tabs>
  );
}

export const Default: Story = { render: () => <Demo variant="default" /> };
export const Line: Story = { render: () => <Demo variant="line" /> };
export const Vertical: Story = {
  render: () => <Demo variant="default" orientation="vertical" />,
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex flex-col gap-1">
          <code className="text-xs text-muted-foreground">{size}</code>
          <Demo variant="default" size={size} />
        </div>
      ))}
    </div>
  ),
};

export const VerticalSizes: Story = {
  render: () => (
    <div className="flex gap-8">
      {(["sm", "md", "lg"] as const).map((size) => (
        <Demo key={size} variant="default" size={size} orientation="vertical" />
      ))}
    </div>
  ),
};
