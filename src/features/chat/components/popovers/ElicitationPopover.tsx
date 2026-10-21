import { MessageCircleQuestion, X } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";
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
  type ElicitationStep,
  elicitationFields,
  elicitationSteps,
  type InputField,
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

// The free-text box under a choice question's options (see
// `elicitationSteps`). A plain input rather than `QuestionnaireInput`: that
// one submits under the item's own name and, in a single-select, replaces the
// picked option, whereas this is a separate property the agent reads
// alongside the pick. Styled to match it.
function OtherInput({
  field,
  error,
  disabled,
}: {
  field: InputField;
  error: string | undefined;
  disabled: boolean;
}) {
  // Not a registered answer, so the questionnaire ignores Enter here and the
  // browser would submit the whole form from any step — advance instead.
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    e.currentTarget.form
      ?.querySelector<HTMLButtonElement>(
        "[data-slot=questionnaire-next]:not([aria-hidden]), [data-slot=questionnaire-submit]:not([aria-hidden])",
      )
      ?.click();
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-300">{field.title}</span>
      <input
        name={field.name}
        type="text"
        defaultValue={field.defaultValue}
        minLength={field.minLength}
        maxLength={field.maxLength}
        placeholder={field.description}
        disabled={disabled}
        aria-invalid={!!error || undefined}
        onKeyDown={onKeyDown}
        className="w-full min-w-0 rounded-md bg-card px-2 py-1.5 text-sm text-foreground shadow-[0_0_0_1px_var(--border)] transition-shadow outline-none placeholder:text-zinc-600 focus-visible:shadow-[0_0_0_1px_var(--primary)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:shadow-[0_0_0_1px_var(--destructive)]"
      />
    </label>
  );
}

function StepItem({
  step: { field, other },
  errors,
}: {
  step: ElicitationStep;
  errors: Record<string, string>;
}) {
  // A skipped question leaves its "Other" text out of the answer too.
  const [skipped, setSkipped] = useState(false);
  const error = errors[field.name] ?? (other && errors[other.name]);
  return (
    <QuestionnaireItem
      name={field.name}
      required={field.required}
      multiple={field.kind === "choice" && field.multiple}
      invalid={!!error}
      onStatusChange={(status) => setSkipped(status === "skipped")}
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
      {other && (
        <OtherInput
          field={other}
          error={errors[other.name]}
          disabled={skipped}
        />
      )}
      <QuestionnaireError>{error}</QuestionnaireError>
    </QuestionnaireItem>
  );
}

// An agent's structured question (ACP `elicitation/create`, form mode) as a
// popover anchored above the chat input — the same slot and visual language
// as `PermissionPopover`, with the questions themselves rendered by
// `Questionnaire`, one property per step (a choice's "Other" box shares its
// step — see `elicitationSteps`). "Decline" and the close button map
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
  const steps = useMemo(() => elicitationSteps(fields), [fields]);
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
    const first = steps.find(
      (s) =>
        result.errors[s.field.name] || (s.other && result.errors[s.other.name]),
    );
    if (first) setActiveItem(first.field.name);
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
              {steps.map((step) => (
                <StepItem key={step.field.name} step={step} errors={errors} />
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
