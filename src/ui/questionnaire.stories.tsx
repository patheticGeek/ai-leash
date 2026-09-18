import type { Meta, StoryObj } from "@storybook/react-vite";
import { Questionnaire } from "./questionnaire";

const meta = {
  title: "UI/Questionnaire",
  component: Questionnaire,
  args: {
    title: "A few questions",
    description: "The agent needs some details before it continues.",
    onSubmit: (answers) => console.log("submit", answers),
    onCancel: () => console.log("cancel"),
    questions: [
      {
        id: "name",
        kind: "text",
        prompt: "What should the branch be called?",
        placeholder: "feature/…",
        required: true,
      },
      {
        id: "scope",
        kind: "single",
        prompt: "How much should it change?",
        required: true,
        options: [
          {
            value: "minimal",
            label: "Minimal",
            description: "Only what's needed",
          },
          {
            value: "thorough",
            label: "Thorough",
            description: "Refactor nearby code too",
          },
        ],
      },
      {
        id: "checks",
        kind: "multi",
        prompt: "Which checks should run?",
        options: [
          { value: "lint", label: "Lint" },
          { value: "types", label: "Typecheck" },
          { value: "tests", label: "Tests" },
        ],
      },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Questionnaire>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleQuestion: Story = {
  args: {
    title: undefined,
    description: undefined,
    onCancel: undefined,
    submitLabel: "Continue",
    questions: [
      {
        id: "ok",
        kind: "single",
        prompt: "Overwrite the existing file?",
        required: true,
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
      },
    ],
  },
};
