import { Button } from "@astryxdesign/core/Button";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import {
  CheckboxList,
  CheckboxListItem,
} from "@astryxdesign/core/CheckboxList";
import { DateInput } from "@astryxdesign/core/DateInput";
import {
  DateTimeInput,
  type ISODateTimeString,
} from "@astryxdesign/core/DateTimeInput";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Kbd } from "@astryxdesign/core/Kbd";
import { List, ListItem } from "@astryxdesign/core/List";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { QuestionMark, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collectAnswers,
  type ElicitationField,
  type ElicitationStep,
  elicitationFields,
  elicitationSteps,
} from "../../../../lib/elicitationForm";
import {
  currentPromptIndex,
  MAX_NUMBERED_OPTIONS,
  optionKey,
  stepPromptIndex,
} from "../../../../lib/promptKeys";
import type {
  ElicitationAnswer,
  ElicitationRequestPayload,
} from "../../../../lib/tauriApi";
import { elicitationsForSession, useAppStore } from "../../../../store";
import PromptCard, {
  ButtonKbd,
  focusComposerAfterAnswer,
  type PromptQueue,
} from "./PromptCard";

const styles = stylex.create({
  // A one-of choice's validation message (the field status a RadioList
  // would have drawn).
  errorText: { color: colorVars["--color-text-error"] },
  // A long form scrolls inside the card rather than pushing the dock up
  // past the top of the panel.
  body: {
    maxHeight: "50vh",
  },
  message: { whiteSpace: "pre-wrap" },
});

interface ElicitationPromptProps {
  // The oldest form open for this session (`elicitationForSession`).
  request: ElicitationRequestPayload;
  // `requestId`: the form on screen, which may not be `request` once the
  // user steps through several.
  onRespond: (answer: ElicitationAnswer, requestId: string) => void;
}

// Every field's current answer as strings — a choice's picked values, or an
// input's text (empty array for no answer) — the shape `collectAnswers`
// reads back out of form data.
type Values = Record<string, string[]>;

function initialValues(fields: ElicitationField[]): Values {
  return Object.fromEntries(
    fields.map((f) => [
      f.name,
      f.kind === "choice"
        ? f.defaultValues
        : f.defaultValue !== undefined
          ? [f.defaultValue]
          : [],
    ]),
  );
}

// The answers as `FormData`, leaving out skipped steps — a skipped question
// leaves its "Other" text out of the answer too.
function toFormData(
  steps: ElicitationStep[],
  values: Values,
  skipped: ReadonlySet<string>,
): FormData {
  const data = new FormData();
  for (const { field, other } of steps) {
    if (skipped.has(field.name)) continue;
    for (const f of other ? [field, other] : [field]) {
      for (const v of values[f.name] ?? []) data.append(f.name, v);
    }
  }
  return data;
}

// A choice's number key, for the first nine. Plain digits: `kbdKeys` has
// nothing to change in them.
function ChoiceKey({ index }: { index: number }) {
  const key = optionKey(index);
  return key ? <Kbd keys={key} /> : null;
}

// Enter (Next / Submit) is the prompt's own key (`PromptCard`), so no field
// here handles it.
function FieldControl({
  field,
  values,
  error,
  onChange,
  isBare = false,
}: {
  field: ElicitationField;
  values: Values;
  error: string | undefined;
  onChange: (name: string, value: string[]) => void;
  /** A choice's "Other" box: just the input, its hint in the placeholder. */
  isBare?: boolean;
}) {
  const current = values[field.name] ?? [];
  const status = error ? { type: "error" as const, message: error } : undefined;
  const common = {
    label: field.title,
    description: field.description,
    isRequired: field.required,
    status,
    width: "100%",
  };
  // Inputs come in the prompt's compact size (Astryx's
  // `CheckboxList` has one size).
  const size = "sm" as const;
  if (field.kind === "choice") {
    return field.multiple ? (
      <CheckboxList
        {...common}
        value={current}
        onChange={(v) => onChange(field.name, v)}
      >
        {field.choices.map((c, i) => (
          <CheckboxListItem
            key={c.value}
            value={c.value}
            label={c.title}
            description={c.description}
            endContent={<ChoiceKey index={i} />}
          />
        ))}
      </CheckboxList>
    ) : (
      // A one-of choice is a list of rows, not radio buttons: the number
      // key leads each row and the picked one takes the selected fill.
      <VStack gap={1}>
        <List
          density="compact"
          edge="flush"
          header={
            <Text size="sm" color="secondary">
              {field.title}
            </Text>
          }
        >
          {field.choices.map((c, i) => (
            <ListItem
              key={c.value}
              label={c.title}
              description={c.description}
              startContent={<ChoiceKey index={i} />}
              isSelected={current[0] === c.value}
              onClick={() => onChange(field.name, [c.value])}
            />
          ))}
        </List>
        {error && (
          <Text size="sm" xstyle={styles.errorText}>
            {error}
          </Text>
        )}
      </VStack>
    );
  }
  const set = (v: string | undefined) =>
    onChange(field.name, v === undefined || v === "" ? [] : [v]);
  switch (field.inputType) {
    case "number":
      return (
        <NumberInput
          {...common}
          size={size}
          value={current[0] === undefined ? null : Number(current[0])}
          onChange={(n) => set(Number.isFinite(n) ? String(n) : undefined)}
          min={field.min ?? null}
          max={field.max ?? null}
          step={field.valueType === "integer" ? 1 : null}
        />
      );
    case "date":
      // `collectAnswers` validates the text, so the brands are just casts.
      return (
        <DateInput
          {...common}
          size={size}
          value={current[0] as ISODateString | undefined}
          onChange={set}
        />
      );
    case "datetime-local":
      return (
        <DateTimeInput
          {...common}
          size={size}
          value={current[0] as ISODateTimeString | undefined}
          onChange={set}
        />
      );
    default:
      return (
        <TextInput
          {...common}
          size={size}
          type={field.inputType}
          value={current[0] ?? ""}
          onChange={(v) => set(v)}
          {...(isBare && {
            isLabelHidden: true,
            description: undefined,
            placeholder: field.description ?? field.title,
          })}
        />
      );
  }
}

// An agent's structured question (ACP `elicitation/create`, form mode), in
// the composer's place on its card surface like `PermissionPrompt` (see
// `PromptCard`). An agent may have several open at once: this steps through
// them (`[`/`]`), one `ElicitationForm` each — stepping away from a form
// drops what was typed into it. `ChatComposer.tsx` decides *whether* to
// render it.
export default function ElicitationPrompt({
  request,
  onRespond,
}: ElicitationPromptProps) {
  const pending = useAppStore((s) => s.pendingElicitations);
  const all = elicitationsForSession(pending, request.sessionId);
  const queue = all.length > 0 ? all : [request];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const index = currentPromptIndex(
    queue.map((r) => r.id),
    selectedId,
  );
  const shown = queue[index] ?? request;
  return (
    <ElicitationForm
      key={shown.id}
      request={shown}
      queue={{
        index,
        count: queue.length,
        onStep: (delta) =>
          setSelectedId(
            queue[stepPromptIndex(index, queue.length, delta)]?.id ?? null,
          ),
      }}
      onRespond={(answer) => {
        onRespond(answer, shown.id);
        if (queue.length <= 1) focusComposerAfterAnswer();
      }}
    />
  );
}

// One form, with the questions rendered by Astryx form controls, one
// property per step (a choice's "Other" box shares its step — see
// `elicitationSteps`). "Decline" (Esc) and the close button map to the
// protocol's two refusals: an explicit "no" versus dismissing without
// choosing.
function ElicitationForm({
  request,
  queue,
  onRespond,
}: {
  request: ElicitationRequestPayload;
  queue: PromptQueue;
  onRespond: (answer: ElicitationAnswer) => void;
}) {
  const fields = useMemo(
    () => elicitationFields(request.schema),
    [request.schema],
  );
  const steps = useMemo(() => elicitationSteps(fields), [fields]);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState(() => initialValues(fields));
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Focus the step's first field: when the form appears (after `PromptCard`
  // has focused itself — child effects run first) and on each new step. Not
  // while the user's typing elsewhere: then focus is outside the card and
  // stays there.
  const bodyRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: stepIndex is a trigger-only dep — a new step means new fields to focus
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const active = body.ownerDocument.activeElement;
    const isOurs =
      !active ||
      active === body.ownerDocument.body ||
      active.contains(body) ||
      body.contains(active);
    if (!isOurs) return;
    body
      .querySelector<HTMLElement>("input, textarea, ul button")
      ?.focus({ preventScroll: true });
  }, [stepIndex]);

  function setValue(name: string, value: string[]) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function markSkipped(name: string, isSkipped: boolean) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (isSkipped) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  function submit(skippedNow: ReadonlySet<string>) {
    const result = collectAnswers(
      fields,
      toFormData(steps, values, skippedNow),
    );
    if (result.ok) {
      onRespond({ action: "accept", content: result.content });
      return;
    }
    setErrors(result.errors);
    // Jump to the first question with a problem — it may not be the one on
    // screen, since the form shows one at a time.
    const first = steps.findIndex(
      (s) =>
        result.errors[s.field.name] || (s.other && result.errors[s.other.name]),
    );
    if (first >= 0) setStepIndex(first);
  }

  // Next / Submit: the step on screen has to check out before moving on.
  function advance() {
    if (!step) return;
    markSkipped(step.field.name, false);
    const unskipped = new Set(skipped);
    unskipped.delete(step.field.name);
    const result = collectAnswers(fields, toFormData(steps, values, unskipped));
    const names = [step.field.name, step.other?.name].filter(
      (n): n is string => !!n,
    );
    const stepErrors = result.ok
      ? {}
      : Object.fromEntries(
          names.flatMap((n) =>
            result.errors[n] ? [[n, result.errors[n]]] : [],
          ),
        );
    if (Object.keys(stepErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...stepErrors }));
      return;
    }
    if (isLast) submit(unskipped);
    else setStepIndex(stepIndex + 1);
  }

  function skip() {
    if (!step) return;
    markSkipped(step.field.name, true);
    const withSkip = new Set(skipped).add(step.field.name);
    if (isLast) submit(withSkip);
    else setStepIndex(stepIndex + 1);
  }

  // Number keys pick the step's choices, or Accept / Decline when there's
  // nothing to fill in.
  const choiceField =
    step && step.field.kind === "choice" ? step.field : undefined;
  const optionCount =
    fields.length === 0
      ? 2
      : Math.min(choiceField?.choices.length ?? 0, MAX_NUMBERED_OPTIONS);

  function pickChoice(i: number) {
    if (fields.length === 0) {
      onRespond(
        i === 0 ? { action: "accept", content: {} } : { action: "decline" },
      );
      return;
    }
    const choice = choiceField?.choices[i];
    if (!choiceField || !choice) return;
    const current = values[choiceField.name] ?? [];
    if (!choiceField.multiple) {
      setValue(choiceField.name, [choice.value]);
    } else if (current.includes(choice.value)) {
      setValue(
        choiceField.name,
        current.filter((v) => v !== choice.value),
      );
    } else {
      setValue(choiceField.name, [...current, choice.value]);
    }
  }

  const title = request.schema.title;
  const detail = [
    title,
    steps.length > 1 ? `question ${stepIndex + 1} of ${steps.length}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PromptCard
      promptId={request.id}
      icon={QuestionMark}
      label={
        title ? `Question from the agent: ${title}` : "Question from the agent"
      }
      heading="Asked you a question"
      detail={detail || undefined}
      announcement={`The agent has a question: ${title ?? request.message}. Enter ${fields.length === 0 ? "accepts" : isLast ? "submits" : "goes to the next question"}, Escape declines.`}
      queue={queue}
      optionCount={optionCount}
      onKeyAction={(action) => {
        if (action.type === "refuse") onRespond({ action: "decline" });
        else if (action.type === "option") pickChoice(action.index);
        else if (fields.length === 0) {
          onRespond({ action: "accept", content: {} });
        } else advance();
      }}
      headerEnd={
        <IconButton
          variant="ghost"
          size="sm"
          label="Dismiss"
          tooltip="Dismiss without answering"
          icon={<X size={14} />}
          onClick={() => onRespond({ action: "cancel" })}
        />
      }
      actions={
        <>
          {fields.length === 0 ? (
            // Nothing to fill in — the agent just wants a yes/no.
            <Button
              variant="primary"
              size="sm"
              label="Accept"
              tooltip="Accept (Enter or 1)"
              endContent={<ButtonKbd keys="enter" />}
              onClick={() => onRespond({ action: "accept", content: {} })}
            />
          ) : (
            <Button
              variant="primary"
              size="sm"
              label={isLast ? "Submit" : "Next"}
              tooltip={isLast ? "Submit (Enter)" : "Next question (Enter)"}
              endContent={<ButtonKbd keys="enter" />}
              onClick={advance}
            />
          )}
          {step && !step.field.required && (
            <Button variant="secondary" size="sm" label="Skip" onClick={skip} />
          )}
          <Button
            variant="secondary"
            size="sm"
            label="Decline"
            tooltip={
              fields.length === 0
                ? "Decline to answer (Esc or 2)"
                : "Decline to answer (Esc)"
            }
            endContent={<ButtonKbd keys="escape" />}
            onClick={() => onRespond({ action: "decline" })}
          />
          {stepIndex > 0 && (
            <Button
              variant="ghost"
              size="sm"
              label="Previous"
              onClick={() => setStepIndex(stepIndex - 1)}
            />
          )}
        </>
      }
    >
      <VStack ref={bodyRef} gap={2} isScrollable xstyle={styles.body}>
        <VStack gap={0.5}>
          <Text size="lg" xstyle={styles.message}>
            {request.message}
          </Text>
          {request.schema.description && (
            <Text size="sm" color="secondary">
              {request.schema.description}
            </Text>
          )}
        </VStack>
        {step && (
          <VStack key={step.field.name} gap={2}>
            <FieldControl
              field={step.field}
              values={values}
              error={errors[step.field.name]}
              onChange={setValue}
            />
            {step.other && (
              <FieldControl
                field={step.other}
                values={values}
                error={errors[step.other.name]}
                onChange={setValue}
                isBare
              />
            )}
          </VStack>
        )}
      </VStack>
    </PromptCard>
  );
}
