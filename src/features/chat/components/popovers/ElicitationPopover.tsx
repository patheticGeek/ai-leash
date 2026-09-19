import { MessageCircleQuestion, X } from "lucide-react";
import type { RefObject } from "react";
import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/ui/popover";
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
} from "@/ui/questionnaire";
import {
  collectAnswers,
  type ElicitationField,
  elicitationFields,
} from "../../../../lib/elicitationForm";
import type {
  ElicitationAnswer,
  ElicitationRequestPayload,
} from "../../../../lib/tauriApi";

interface ElicitationPopoverProps {
  request: ElicitationRequestPayload;
  onRespond: (answer: ElicitationAnswer) => void;
  // The chat input box the form opens above (it's a popover, not part of it).
  anchorRef: RefObject<HTMLElement | null>;
}

function FieldItem({
  field,
  error,
}: {
  field: ElicitationField;
  error: string | undefined;
}) {
  return (
    <QuestionnaireItem
      name={field.name}
      required={field.required}
      multiple={field.kind === "choice" && field.multiple}
      invalid={!!error}
    >
      <QuestionnaireTitle>{field.title}</QuestionnaireTitle>
      {field.description && (
        <QuestionnaireDescription>{field.description}</QuestionnaireDescription>
      )}
      {field.kind === "choice" ? (
        <QuestionnaireChoices>
          {field.choices.map((choice) => (
            <QuestionnaireChoice
              key={choice.value}
              value={choice.value}
              defaultChecked={field.defaultValues.includes(choice.value)}
            >
              {choice.title}
              {choice.description && (
                <QuestionnaireChoiceDescription>
                  {choice.description}
                </QuestionnaireChoiceDescription>
              )}
            </QuestionnaireChoice>
          ))}
        </QuestionnaireChoices>
      ) : (
        <QuestionnaireInput
          type={field.inputType}
          defaultValue={field.defaultValue}
          minLength={field.minLength}
          maxLength={field.maxLength}
          min={field.min}
          max={field.max}
          step={field.valueType === "integer" ? 1 : "any"}
        />
      )}
      <QuestionnaireError>{error}</QuestionnaireError>
    </QuestionnaireItem>
  );
}

// An agent's structured question (ACP `elicitation/create`, form mode) as a
// popover anchored above the chat input — the same slot and visual language
// as `PermissionPopover`, with the questions themselves rendered by
// `Questionnaire`, one property per step. "Decline" and the close button map
// to the protocol's two refusals: an explicit "no" versus dismissing without
// choosing. `ChatComposer.tsx` decides *whether* to render it.
export default function ElicitationPopover({
  request,
  onRespond,
  anchorRef,
}: ElicitationPopoverProps) {
  const fields = useMemo(
    () => elicitationFields(request.schema),
    [request.schema],
  );
  const [activeItem, setActiveItem] = useState(fields[0]?.name);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = collectAnswers(fields, new FormData(e.currentTarget));
    if (result.ok) {
      onRespond({ action: "accept", content: result.content });
      return;
    }
    setErrors(result.errors);
    // Jump to the first question with a problem — it may not be the one on
    // screen, since the form shows one at a time.
    const first = fields.find((f) => result.errors[f.name]);
    if (first) setActiveItem(first.name);
  }

  return (
    <Popover open>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        side="top"
        align="center"
        sideOffset={4}
        onEscapeKeyDown={() => onRespond({ action: "cancel" })}
        className="max-h-[50vh] w-(--radix-popover-trigger-width) gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <span
            title="The agent is asking you a question"
            className="shrink-0 text-zinc-400"
          >
            <MessageCircleQuestion size={16} />
          </span>
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
            {request.schema.title ?? "The agent has a question"}
          </div>
          <Button
            variant="ghost"
            size="sm"
            title="Decline to answer"
            onClick={() => onRespond({ action: "decline" })}
          >
            Decline
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Dismiss without answering (Esc)"
            aria-label="Dismiss"
            onClick={() => onRespond({ action: "cancel" })}
          >
            <X size={13} />
          </Button>
        </div>
        <div className="flex flex-1 select-text flex-col gap-3 overflow-auto px-3 py-2">
          <p className="text-sm whitespace-pre-wrap text-zinc-300">
            {request.message}
          </p>
          {request.schema.description && (
            <p className="text-xs text-muted-foreground">
              {request.schema.description}
            </p>
          )}
          {fields.length > 0 ? (
            <Questionnaire
              item={activeItem}
              onItemChange={setActiveItem}
              onSubmit={onSubmit}
            >
              <QuestionnaireProgress />
              {fields.map((field) => (
                <FieldItem
                  key={field.name}
                  field={field}
                  error={errors[field.name]}
                />
              ))}
              <QuestionnaireActions>
                <QuestionnairePrevious />
                <QuestionnaireSkip />
                <QuestionnaireNext />
                <QuestionnaireSubmit />
              </QuestionnaireActions>
            </Questionnaire>
          ) : (
            // Nothing to fill in — the agent just wants a yes/no.
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={() => onRespond({ action: "accept", content: {} })}
              >
                Accept
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
