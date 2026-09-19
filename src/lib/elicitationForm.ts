import type {
  ElicitationContentValue,
  ElicitationEnumOption,
  ElicitationPropertySchema,
  ElicitationSchema,
} from "./tauriApi";

// Turns an ACP elicitation schema into the one-question-per-property form
// `ElicitationPopover` renders with `Questionnaire`, and turns the submitted
// `FormData` back into the typed `content` the protocol expects. Kept apart
// from the component so the mapping (and its validation) has no React in it.

export interface ElicitationChoice {
  value: string;
  title: string;
  description?: string;
}

interface FieldBase {
  name: string;
  title: string;
  description?: string;
  required: boolean;
}

export interface ChoiceField extends FieldBase {
  kind: "choice";
  multiple: boolean;
  // A `boolean` property, shown as Yes/No but answered as true/false.
  isBoolean: boolean;
  choices: ElicitationChoice[];
  defaultValues: string[];
  minItems?: number;
  maxItems?: number;
}

export interface InputField extends FieldBase {
  kind: "input";
  valueType: "string" | "number" | "integer";
  inputType: "text" | "email" | "url" | "date" | "datetime-local" | "number";
  defaultValue?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
}

export type ElicitationField = ChoiceField | InputField;

const YES_NO: ElicitationChoice[] = [
  { value: "true", title: "Yes" },
  { value: "false", title: "No" },
];

function toChoices(options: ElicitationEnumOption[]): ElicitationChoice[] {
  return options.map((o) => ({
    value: o.const,
    title: o.title,
    description: o.description,
  }));
}

// `datetime-local` inputs work in the user's local time without a zone; the
// protocol's `date-time` format is an RFC 3339 instant, so convert both ways.
function isoToLocalInput(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fieldFor(
  name: string,
  prop: ElicitationPropertySchema,
  required: boolean,
): ElicitationField {
  const base = {
    name,
    title: prop.title ?? name,
    description: prop.description,
    required,
  };

  if (prop.type === "boolean") {
    const def = prop.default;
    return {
      ...base,
      kind: "choice",
      multiple: false,
      isBoolean: true,
      choices: YES_NO,
      defaultValues: typeof def === "boolean" ? [String(def)] : [],
    };
  }

  if (prop.type === "array") {
    const items = prop.items as
      | { enum: string[] }
      | { anyOf: ElicitationEnumOption[] }
      | undefined;
    const choices =
      items && "anyOf" in items
        ? toChoices(items.anyOf)
        : (items?.enum ?? []).map((v) => ({ value: v, title: v }));
    return {
      ...base,
      kind: "choice",
      multiple: true,
      isBoolean: false,
      choices,
      defaultValues: (prop.default as string[] | undefined) ?? [],
      minItems: prop.minItems as number | undefined,
      maxItems: prop.maxItems as number | undefined,
    };
  }

  if (prop.type === "string" && (prop.oneOf || prop.enum)) {
    const choices = prop.oneOf
      ? toChoices(prop.oneOf as ElicitationEnumOption[])
      : (prop.enum as string[]).map((v) => ({ value: v, title: v }));
    const def = prop.default as string | undefined;
    return {
      ...base,
      kind: "choice",
      multiple: false,
      isBoolean: false,
      choices,
      defaultValues: def === undefined ? [] : [def],
    };
  }

  if (prop.type === "number" || prop.type === "integer") {
    return {
      ...base,
      kind: "input",
      valueType: prop.type,
      inputType: "number",
      defaultValue:
        typeof prop.default === "number" ? String(prop.default) : undefined,
      min: prop.minimum as number | undefined,
      max: prop.maximum as number | undefined,
    };
  }

  // A plain string — and the fallback for any property type this client
  // doesn't know, which can at least be answered as text.
  const str = prop as Extract<ElicitationPropertySchema, { type: "string" }>;
  const inputType =
    str.format === "email"
      ? "email"
      : str.format === "uri"
        ? "url"
        : str.format === "date"
          ? "date"
          : str.format === "date-time"
            ? "datetime-local"
            : "text";
  const def = typeof str.default === "string" ? str.default : undefined;
  return {
    ...base,
    kind: "input",
    valueType: "string",
    inputType,
    defaultValue:
      inputType === "datetime-local" && def ? isoToLocalInput(def) : def,
    minLength: str.minLength,
    maxLength: str.maxLength,
    pattern: str.pattern,
  };
}

export function elicitationFields(
  schema: ElicitationSchema,
): ElicitationField[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, prop]) =>
    fieldFor(name, prop, required.has(name)),
  );
}

export type CollectedAnswers =
  | { ok: true; content: Record<string, ElicitationContentValue> }
  | { ok: false; errors: Record<string, string> };

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function parseInput(
  field: InputField,
  raw: string,
): { value: ElicitationContentValue } | { error: string } {
  if (field.valueType === "string") {
    if (field.minLength !== undefined && raw.length < field.minLength) {
      return {
        error: `Enter at least ${plural(field.minLength, "character")}.`,
      };
    }
    if (field.maxLength !== undefined && raw.length > field.maxLength) {
      return {
        error: `Enter at most ${plural(field.maxLength, "character")}.`,
      };
    }
    if (field.pattern) {
      try {
        if (!new RegExp(field.pattern, "u").test(raw)) {
          return { error: "That doesn't match the expected format." };
        }
      } catch {
        // An agent-supplied pattern we can't compile shouldn't block the
        // answer — the agent re-validates whatever it gets anyway.
      }
    }
    if (field.inputType === "datetime-local") {
      const iso = localInputToIso(raw);
      return iso ? { value: iso } : { error: "Enter a valid date and time." };
    }
    return { value: raw };
  }

  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: "Enter a number." };
  if (field.valueType === "integer" && !Number.isInteger(n)) {
    return { error: "Enter a whole number." };
  }
  if (field.min !== undefined && n < field.min) {
    return { error: `Must be at least ${field.min}.` };
  }
  if (field.max !== undefined && n > field.max) {
    return { error: `Must be at most ${field.max}.` };
  }
  return { value: n };
}

// Reads the submitted form back into protocol `content`. Skipped (disabled)
// and blank optional questions are left out entirely — per the protocol an
// absent key means "no answer", not an empty one.
export function collectAnswers(
  fields: ElicitationField[],
  data: FormData,
): CollectedAnswers {
  const content: Record<string, ElicitationContentValue> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (field.kind === "choice") {
      const picked = data
        .getAll(field.name)
        .filter((v) => typeof v === "string");
      if (picked.length === 0) {
        if (field.required) {
          errors[field.name] = field.multiple
            ? "Choose at least one."
            : "Choose one to continue.";
        }
        continue;
      }
      if (field.multiple) {
        if (field.minItems !== undefined && picked.length < field.minItems) {
          errors[field.name] = `Choose at least ${field.minItems}.`;
        } else if (
          field.maxItems !== undefined &&
          picked.length > field.maxItems
        ) {
          errors[field.name] = `Choose at most ${field.maxItems}.`;
        } else {
          content[field.name] = picked;
        }
        continue;
      }
      const [value] = picked;
      content[field.name] = field.isBoolean ? value === "true" : value;
      continue;
    }

    const raw = data.get(field.name);
    if (typeof raw !== "string" || raw === "") {
      if (field.required) errors[field.name] = "This is required.";
      continue;
    }
    const parsed = parseInput(field, raw);
    if ("error" in parsed) errors[field.name] = parsed.error;
    else content[field.name] = parsed.value;
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, content };
}
