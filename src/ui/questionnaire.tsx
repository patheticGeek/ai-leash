import { useState } from "react";
import { Button } from "./button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
import { Checkbox } from "./checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "./field";
import { Input } from "./input";
import { RadioGroup, RadioGroupItem } from "./radio-group";

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

interface QuestionBase {
  id: string;
  prompt: string;
  description?: string;
  required?: boolean;
}

export type Question =
  | (QuestionBase & { kind: "text"; placeholder?: string })
  | (QuestionBase & {
      kind: "single" | "multi";
      options: QuestionOption[];
    });

/** `text`/`single` answers are a string, `multi` answers a string[]. */
export type Answers = Record<string, string | string[]>;

interface QuestionnaireProps {
  title?: string;
  description?: string;
  questions: Question[];
  onSubmit: (answers: Answers) => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  className?: string;
}

function isAnswered(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.length > 0;
  return (value ?? "").trim().length > 0;
}

// A short form an agent can put in front of the user mid-session to gather
// structured input (an elicitation): free text, pick-one, or pick-many.
// Purely presentational — the caller owns what happens with the answers.
// Composed from shadcn's `Field` / `RadioGroup` / `Checkbox` / `Card`
// primitives (upstream's selectable-card `FieldLabel` pattern); only the
// answer bookkeeping and required-field gating are ours.
function Questionnaire({
  title,
  description,
  questions,
  onSubmit,
  onCancel,
  submitLabel = "Submit",
  cancelLabel = "Skip",
  className,
}: QuestionnaireProps) {
  const [answers, setAnswers] = useState<Answers>({});

  const complete = questions.every(
    (q) => !q.required || isAnswered(answers[q.id]),
  );

  function toggleOption(q: Question, value: string) {
    setAnswers((prev) => {
      if (q.kind === "multi") {
        const current = (prev[q.id] as string[] | undefined) ?? [];
        return {
          ...prev,
          [q.id]: current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value],
        };
      }
      return { ...prev, [q.id]: value };
    });
  }

  return (
    <Card data-slot="questionnaire" className={className}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <FieldGroup>
          {questions.map((q) => {
            const prompt = (
              <>
                {q.prompt}
                {q.required && <span className="text-destructive">*</span>}
              </>
            );
            if (q.kind === "text") {
              return (
                <Field key={q.id}>
                  <FieldLabel htmlFor={q.id}>{prompt}</FieldLabel>
                  {q.description && (
                    <FieldDescription>{q.description}</FieldDescription>
                  )}
                  <Input
                    id={q.id}
                    placeholder={q.placeholder}
                    value={(answers[q.id] as string | undefined) ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.id]: e.currentTarget.value,
                      }))
                    }
                  />
                </Field>
              );
            }
            return (
              <FieldSet key={q.id}>
                <FieldLegend variant="label">{prompt}</FieldLegend>
                {q.description && (
                  <FieldDescription>{q.description}</FieldDescription>
                )}
                {q.kind === "single" ? (
                  <RadioGroup
                    value={(answers[q.id] as string | undefined) ?? ""}
                    onValueChange={(value) => toggleOption(q, value)}
                  >
                    {q.options.map((o) => (
                      <FieldLabel key={o.value} htmlFor={`${q.id}-${o.value}`}>
                        <Field orientation="horizontal">
                          <RadioGroupItem
                            id={`${q.id}-${o.value}`}
                            value={o.value}
                          />
                          <FieldContent>
                            <FieldTitle>{o.label}</FieldTitle>
                            {o.description && (
                              <FieldDescription>
                                {o.description}
                              </FieldDescription>
                            )}
                          </FieldContent>
                        </Field>
                      </FieldLabel>
                    ))}
                  </RadioGroup>
                ) : (
                  <FieldGroup data-slot="checkbox-group" className="gap-2">
                    {q.options.map((o) => (
                      <FieldLabel key={o.value} htmlFor={`${q.id}-${o.value}`}>
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`${q.id}-${o.value}`}
                            checked={(
                              (answers[q.id] as string[] | undefined) ?? []
                            ).includes(o.value)}
                            onCheckedChange={() => toggleOption(q, o.value)}
                          />
                          <FieldContent>
                            <FieldTitle>{o.label}</FieldTitle>
                            {o.description && (
                              <FieldDescription>
                                {o.description}
                              </FieldDescription>
                            )}
                          </FieldContent>
                        </Field>
                      </FieldLabel>
                    ))}
                  </FieldGroup>
                )}
              </FieldSet>
            );
          })}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end gap-1.5">
        {onCancel && (
          <Button variant="ghost" size="md" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button
          variant="primary"
          size="md"
          disabled={!complete}
          onClick={() => onSubmit(answers)}
        >
          {submitLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}

export { Questionnaire };
