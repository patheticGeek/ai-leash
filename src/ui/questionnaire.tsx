import { Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
import { Input } from "./input";
import { Label } from "./label";

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
      <CardContent className="space-y-4">
        {questions.map((q) => (
          <div key={q.id} className="space-y-1.5">
            <Label htmlFor={q.kind === "text" ? q.id : undefined}>
              {q.prompt}
              {q.required && <span className="text-destructive">*</span>}
            </Label>
            {q.description && (
              <p className="text-xs text-muted-foreground">{q.description}</p>
            )}
            {q.kind === "text" ? (
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
            ) : (
              <div className="rounded-md bg-raised py-1">
                {q.options.map((o) => {
                  const value = answers[q.id];
                  const selected = Array.isArray(value)
                    ? value.includes(o.value)
                    : value === o.value;
                  return (
                    <Button
                      key={o.value}
                      variant="menu-item"
                      size="none"
                      data-active={selected}
                      aria-pressed={selected}
                      onClick={() => toggleOption(q, o.value)}
                      className="flex items-start gap-2"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center border border-zinc-600 text-primary-foreground",
                          q.kind === "multi" ? "rounded-sm" : "rounded-full",
                          selected && "border-primary bg-primary",
                        )}
                      >
                        {selected && <Check size={11} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-zinc-100">
                          {o.label}
                        </span>
                        {o.description && (
                          <span className="block whitespace-normal text-xs text-zinc-500">
                            {o.description}
                          </span>
                        )}
                      </span>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
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
