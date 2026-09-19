import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, AlertAction, AlertDescription } from "./alert";
import { Button } from "./button";

const meta = {
  title: "UI/Alert",
  component: Alert,
  args: { variant: "default", outline: false },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "info", "warning", "danger"],
    },
    outline: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
  render: (args) => (
    <Alert {...args}>
      <AlertDescription>Something worth telling you about.</AlertDescription>
    </Alert>
  ),
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Info: Story = { args: { variant: "info" } };
export const Warning: Story = { args: { variant: "warning" } };
export const Danger: Story = { args: { variant: "danger", outline: true } };
export const WithActions: Story = {
  args: { variant: "warning" },
  render: (args) => (
    <Alert {...args}>
      <AlertDescription>
        Session limit hit. Resume automatically?
      </AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline">
          No
        </Button>
        <Button size="sm">Yes</Button>
      </AlertAction>
    </Alert>
  ),
};
