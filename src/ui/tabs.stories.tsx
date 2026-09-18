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
  orientation,
}: {
  variant: "default" | "line";
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <Tabs defaultValue="general" orientation={orientation} className="w-80">
      <TabsList variant={variant}>
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
