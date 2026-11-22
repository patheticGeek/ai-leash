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
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { MessageCircleQuestion, X } from "lucide-react";
import type { RefObject } from "react";
import { useMemo, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/ui/popover";
import {
  collectAnswers,
  type ElicitationField,
  type ElicitationStep,
  elicitationFields,
  elicitationSteps,
} from "../../../../lib/elicitationForm";
import type {
  ElicitationAnswer,
  ElicitationRequestPayload,
} from "../../../../lib/tauriApi";

const styles = stylex.create({
  // Skip / Next sit at the far end of the actions row.
  end: {
    flexGrow: 1,
  },
});

interface ElicitationPopoverProps {
  request: ElicitationRequestPayload;
  onRespond: (answer: ElicitationAnswer) => void;
  // The chat input box the form opens above (it's a popover, not part of it).
  anchorRef: RefObject<HTMLElement | null>;
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

function FieldControl({
  field,
  values,
  error,
  onChange,
  onEnter,
}: {
  field: ElicitationField;
  values: Values;
  error: string | undefined;
  onChange: (name: string, value: string[]) => void;
  onEnter: () => void;
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
  if (field.kind === "choice") {
    return field.multiple ? (
      <CheckboxList
        {...common}
        value={current}
        onChange={(v) => onChange(field.name, v)}
      >
        {field.choices.map((c) => (
          <CheckboxListItem
            key={c.value}
            value={c.value}
            label={c.title}
            description={c.description}
          />
        ))}
      </CheckboxList>
    ) : (
      <RadioList
        {...common}
        value={current[0] ?? ""}
        onChange={(v) => onChange(field.name, [v])}
      >
        {field.choices.map((c) => (
          <RadioListItem
            key={c.value}
            value={c.value}
            label={c.title}
            description={c.description}
          />
        ))}
      </RadioList>
    );
  }
  const set = (v: string | undefined) =>
    onChange(field.name, v === undefined || v === "" ? [] : [v]);
  switch (field.inputType) {
    case "number":
      return (
        <NumberInput
          {...common}
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
          value={current[0] as ISODateString | undefined}
          onChange={set}
        />
      );
    case "datetime-local":
      return (
        <DateTimeInput
          {...common}
          value={current[0] as ISODateTimeString | undefined}
          onChange={set}
        />
      );
    default:
      return (
        <TextInput
          {...common}
          type={field.inputType}
          value={current[0] ?? ""}
          onChange={(v) => set(v)}
          onEnter={onEnter}
        />
      );
  }
}

// An agent's structured question (ACP `elicitation/create`, form mode) as a
// popover anchored above the chat input — the same slot and visual language
// as `PermissionPopover`, with the questions themselves rendered by
// Astryx form controls, one property per step (a choice's "Other" box shares its
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
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState(() => initialValues(fields));
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  function setValue(name: string, value: string[]) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors(({ [name]: _, ...rest }) => rest);
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
            label="Decline"
            tooltip="Decline to answer"
            onClick={() => onRespond({ action: "decline" })}
          />
          <IconButton
            variant="ghost"
            size="sm"
            label="Dismiss"
            tooltip="Dismiss without answering (Esc)"
            icon={<X size={13} />}
            onClick={() => onRespond({ action: "cancel" })}
          />
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
            <VStack gap={4}>
              {steps.length > 1 && (
                <Text type="supporting" size="xsm">
                  {`Question ${stepIndex + 1} of ${steps.length}`}
                </Text>
              )}
              {step && (
                <VStack key={step.field.name} gap={3}>
                  <FieldControl
                    field={step.field}
                    values={values}
                    error={errors[step.field.name]}
                    onChange={setValue}
                    onEnter={advance}
                  />
                  {step.other && (
                    <FieldControl
                      field={step.other}
                      values={values}
                      error={errors[step.other.name]}
                      onChange={setValue}
                      onEnter={advance}
                    />
                  )}
                </VStack>
              )}
              <HStack gap={2} align="center">
                {stepIndex > 0 && (
                  <Button
                    variant="ghost"
                    label="Previous"
                    onClick={() => setStepIndex(stepIndex - 1)}
                  />
                )}
                <HStack
                  gap={2}
                  align="center"
                  justify="end"
                  xstyle={styles.end}
                >
                  {step && !step.field.required && (
                    <Button variant="ghost" label="Skip" onClick={skip} />
                  )}
                  <Button
                    variant="primary"
                    label={isLast ? "Submit" : "Next"}
                    onClick={advance}
                  />
                </HStack>
              </HStack>
            </VStack>
          ) : (
            // Nothing to fill in — the agent just wants a yes/no.
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                label="Accept"
                onClick={() => onRespond({ action: "accept", content: {} })}
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
