import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "./questionnaire";

const meta = {
  title: "UI/Questionnaire",
  component: Questionnaire,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Questionnaire>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ shortcuts }: { shortcuts?: "letters" | "numbers" }) {
  const [answers, setAnswers] = useState<Record<string, unknown> | null>(null);
  return (
    <div className="flex w-96 flex-col gap-3">
      <Questionnaire
        shortcuts={shortcuts}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setAnswers({
            scope: data.get("scope"),
            checks: data.getAll("checks"),
            notes: data.get("notes"),
          });
        }}
      >
        <QuestionnaireProgress />
        <QuestionnaireItem name="scope" required>
          <QuestionnaireTitle>
            Where should this change land?
          </QuestionnaireTitle>
          <QuestionnaireDescription>
            Pick the place the agent should make the edit.
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="frontend">
              Frontend
              <QuestionnaireChoiceDescription>
                React components under src/
              </QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
            <QuestionnaireChoice value="backend">
              Backend
              <QuestionnaireChoiceDescription>
                Rust, src-tauri/
              </QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
            <QuestionnaireChoice value="both">Both</QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError>Choose one to continue.</QuestionnaireError>
        </QuestionnaireItem>
        <QuestionnaireItem name="checks" multiple>
          <QuestionnaireTitle>
            What should it run afterwards?
          </QuestionnaireTitle>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="tsc">Typecheck</QuestionnaireChoice>
            <QuestionnaireChoice value="biome">Lint</QuestionnaireChoice>
            <QuestionnaireChoice value="tests">Tests</QuestionnaireChoice>
          </QuestionnaireChoices>
        </QuestionnaireItem>
        <QuestionnaireItem name="notes">
          <QuestionnaireTitle>Anything else?</QuestionnaireTitle>
          <QuestionnaireInput placeholder="Optional notes" />
        </QuestionnaireItem>
        <QuestionnaireActions>
          <QuestionnairePrevious />
          <QuestionnaireSkip />
          <QuestionnaireNext />
          <QuestionnaireSubmit />
        </QuestionnaireActions>
      </Questionnaire>
      {answers && (
        <pre className="select-text rounded-md bg-sunken p-2 text-xs text-zinc-400">
          {JSON.stringify(answers, null, 2)}
        </pre>
      )}
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
export const NumberShortcuts: Story = {
  render: () => <Demo shortcuts="numbers" />,
};
export const LetterShortcuts: Story = {
  render: () => <Demo shortcuts="letters" />,
};
