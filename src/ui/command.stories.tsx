import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./command";

const meta = {
  title: "UI/Command",
  component: Command,
  decorators: [
    (Story) => (
      <div className="h-72 w-80 rounded-xl ring-1 ring-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Command>
      <CommandInput placeholder="Search…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Branches">
          <CommandItem>main</CommandItem>
          <CommandItem>
            design-tokens <CommandShortcut>current</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Worktrees">
          <CommandItem>ai-leash-1</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
