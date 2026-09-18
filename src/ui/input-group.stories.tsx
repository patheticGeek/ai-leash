import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search, Send } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./input-group";

const meta = {
  title: "UI/InputGroup",
  component: InputGroup,
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconStart: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search…" />
    </InputGroup>
  ),
};

export const TextEnd: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Port" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>tcp</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
};

export const ButtonEnd: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Message" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" title="Send">
          <Send />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
};

export const Textarea: Story = {
  render: () => (
    <InputGroup>
      <InputGroupTextarea placeholder="Write something…" rows={3} />
      <InputGroupAddon align="block-end">
        <InputGroupText>0 / 500</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
};
