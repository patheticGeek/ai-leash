// The declarative "rich reply" spec an agent can write in a fenced ```ui
// block: JSON describing a small tree of display components (tables, stat
// tiles, charts, …) that `ui/UiBlock.tsx` renders with Astryx components.
// It's plain reply text, so it works the same for every backend; it's data
// only — nothing in it is ever executed. Documented for the agent in
// `src-tauri/guides/rich-replies.md` (keep the two in sync; a test in
// `src-tauri/src/tools/guides.rs` checks every node type is documented)
// and for people in `docs/features/agent-chat.md`.
//
// `parseUiSpec` validates a block's source and normalises the shorthand
// forms (string columns, array rows, string list items and options) into
// one shape, so the renderer and `uiSpecToText` only handle that one.

export type Tone = "neutral" | "info" | "success" | "warning" | "error";
export type Cell = string | number | boolean | null;

export interface UiColumn {
  key: string;
  label: string;
  align: "start" | "center" | "end";
}

export interface UiListItem {
  title: string;
  description?: string;
  badge?: string;
  tone?: Tone;
}

export interface UiStat {
  label: string;
  value: string;
  change?: string;
  tone?: Tone;
  description?: string;
}

export interface UiSeries {
  name: string;
  values: number[];
}

export type UiNode =
  | {
      type: "stack";
      direction: "vertical" | "horizontal";
      children: UiNode[];
    }
  | { type: "heading"; text: string; level: 1 | 2 | 3 }
  | { type: "text"; text: string; tone: "default" | "secondary" }
  | {
      type: "table";
      columns: UiColumn[];
      rows: Record<string, Cell>[];
      sortable: boolean;
      caption?: string;
    }
  | { type: "stats"; items: UiStat[] }
  | {
      type: "chart";
      kind: "bar" | "line";
      title?: string;
      labels: string[];
      series: UiSeries[];
      unit?: string;
    }
  | {
      type: "keyValue";
      title?: string;
      items: { label: string; value: Cell }[];
    }
  | { type: "list"; ordered: boolean; items: UiListItem[] }
  | { type: "progress"; label: string; value: number; max: number; tone: Tone }
  | { type: "badge"; label: string; tone: Tone }
  | { type: "status"; label: string; tone: Tone }
  | {
      type: "card";
      title?: string;
      description?: string;
      children: UiNode[];
    }
  | { type: "tabs"; tabs: { label: string; children: UiNode[] }[] }
  | { type: "code"; code: string; language?: string; title?: string }
  | { type: "callout"; tone: Tone; title: string; text?: string }
  | {
      type: "choices";
      prompt?: string;
      options: { label: string; message: string }[];
    }
  | { type: "divider" };

export type UiParseResult =
  | { ok: true; node: UiNode }
  | { ok: false; error: string };

// Caps that keep a runaway block from freezing the transcript.
const MAX_DEPTH = 12;
const MAX_NODES = 500;
const MAX_ROWS = 1000;
const MAX_POINTS = 500;
const MAX_SERIES = 8;

const TONES = new Set<Tone>(["neutral", "info", "success", "warning", "error"]);

class SpecError extends Error {}

type Json = unknown;
type Obj = Record<string, Json>;

function fail(path: string, message: string): never {
  throw new SpecError(`${path}: ${message}`);
}

function isObj(v: Json): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: Json, path: string): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fail(path, "expected a string");
}

function optStr(v: Json, path: string): string | undefined {
  return v === undefined || v === null ? undefined : str(v, path);
}

function num(v: Json, path: string): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return fail(path, "expected a number");
}

function arr(v: Json, path: string, max = Number.POSITIVE_INFINITY): Json[] {
  if (!Array.isArray(v)) fail(path, "expected an array");
  if (v.length > max) fail(path, `too many items (max ${max})`);
  return v;
}

function cell(v: Json, path: string): Cell {
  if (
    v === null ||
    v === undefined ||
    typeof v === "string" ||
    typeof v === "boolean"
  ) {
    return v ?? null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return fail(path, "expected a string, number, boolean or null");
}

function tone(v: Json, path: string, fallback: Tone): Tone {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "string" && TONES.has(v as Tone)) return v as Tone;
  return fail(path, `expected one of ${[...TONES].join(", ")}`);
}

function optTone(v: Json, path: string): Tone | undefined {
  return v === undefined || v === null ? undefined : tone(v, path, "neutral");
}

function oneOf<T extends string>(
  v: Json,
  path: string,
  options: readonly T[],
  fallback: T,
): T {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "string" && (options as readonly string[]).includes(v)) {
    return v as T;
  }
  return fail(path, `expected one of ${options.join(", ")}`);
}

class Parser {
  private count = 0;

  nodes(v: Json, path: string, depth: number): UiNode[] {
    return arr(v ?? [], path).map((child, i) =>
      this.node(child, `${path}[${i}]`, depth),
    );
  }

  node(v: Json, path: string, depth: number): UiNode {
    if (depth > MAX_DEPTH) fail(path, `nested too deeply (max ${MAX_DEPTH})`);
    if (++this.count > MAX_NODES)
      fail(path, `too many nodes (max ${MAX_NODES})`);
    // A bare array is a vertical stack.
    if (Array.isArray(v)) {
      return {
        type: "stack",
        direction: "vertical",
        children: this.nodes(v, path, depth + 1),
      };
    }
    if (!isObj(v)) fail(path, "expected an object with a `type`");
    const p = (key: string) => `${path}.${key}`;
    const type = v.type;
    switch (type) {
      case "stack":
        return {
          type,
          direction: oneOf(
            v.direction,
            p("direction"),
            ["vertical", "horizontal"],
            "vertical",
          ),
          children: this.nodes(v.children, p("children"), depth + 1),
        };
      case "heading": {
        const level = v.level === undefined ? 2 : num(v.level, p("level"));
        return {
          type,
          text: str(v.text, p("text")),
          level: level <= 1 ? 1 : level >= 3 ? 3 : 2,
        };
      }
      case "text":
        return {
          type,
          text: str(v.text, p("text")),
          tone: oneOf(v.tone, p("tone"), ["default", "secondary"], "default"),
        };
      case "table":
        return this.table(v, path);
      case "stats":
        return {
          type,
          items: arr(v.items, p("items"), 50).map((item, i) => {
            const ip = `${p("items")}[${i}]`;
            if (!isObj(item)) fail(ip, "expected an object");
            return {
              label: str(item.label, `${ip}.label`),
              value: str(item.value, `${ip}.value`),
              change: optStr(item.change, `${ip}.change`),
              tone: optTone(item.tone, `${ip}.tone`),
              description: optStr(item.description, `${ip}.description`),
            };
          }),
        };
      case "chart":
        return this.chart(v, path);
      case "keyValue":
        return {
          type,
          title: optStr(v.title, p("title")),
          items: arr(v.items, p("items"), MAX_ROWS).map((item, i) => {
            const ip = `${p("items")}[${i}]`;
            if (!isObj(item)) fail(ip, "expected an object");
            return {
              label: str(item.label, `${ip}.label`),
              value: cell(item.value, `${ip}.value`),
            };
          }),
        };
      case "list":
        return {
          type,
          ordered: v.ordered === true,
          items: arr(v.items, p("items"), MAX_ROWS).map((item, i) => {
            const ip = `${p("items")}[${i}]`;
            if (!isObj(item)) return { title: str(item, ip) };
            return {
              title: str(item.title, `${ip}.title`),
              description: optStr(item.description, `${ip}.description`),
              badge: optStr(item.badge, `${ip}.badge`),
              tone: optTone(item.tone, `${ip}.tone`),
            };
          }),
        };
      case "progress": {
        const max = v.max === undefined ? 100 : num(v.max, p("max"));
        if (max <= 0) fail(p("max"), "must be greater than 0");
        return {
          type,
          label: str(v.label, p("label")),
          value: Math.min(Math.max(num(v.value, p("value")), 0), max),
          max,
          tone: tone(v.tone, p("tone"), "info"),
        };
      }
      case "badge":
      case "status":
        return {
          type,
          label: str(v.label, p("label")),
          tone: tone(v.tone, p("tone"), "neutral"),
        };
      case "card":
        return {
          type,
          title: optStr(v.title, p("title")),
          description: optStr(v.description, p("description")),
          children: this.nodes(v.children, p("children"), depth + 1),
        };
      case "tabs": {
        const tabs = arr(v.tabs, p("tabs"), 20);
        if (tabs.length === 0) fail(p("tabs"), "needs at least one tab");
        return {
          type,
          tabs: tabs.map((tab, i) => {
            const tp = `${p("tabs")}[${i}]`;
            if (!isObj(tab)) fail(tp, "expected an object");
            return {
              label: str(tab.label, `${tp}.label`),
              children: this.nodes(tab.children, `${tp}.children`, depth + 1),
            };
          }),
        };
      }
      case "code":
        return {
          type,
          code: str(v.code, p("code")),
          language: optStr(v.language, p("language")),
          title: optStr(v.title, p("title")),
        };
      case "callout":
        return {
          type,
          tone: tone(v.tone, p("tone"), "info"),
          title: str(v.title, p("title")),
          text: optStr(v.text, p("text")),
        };
      case "choices": {
        const options = arr(v.options, p("options"), 20);
        if (options.length === 0) fail(p("options"), "needs at least one");
        return {
          type,
          prompt: optStr(v.prompt, p("prompt")),
          options: options.map((option, i) => {
            const op = `${p("options")}[${i}]`;
            if (!isObj(option)) {
              const label = str(option, op);
              return { label, message: label };
            }
            const label = str(option.label, `${op}.label`);
            return {
              label,
              message: optStr(option.message, `${op}.message`) ?? label,
            };
          }),
        };
      }
      case "divider":
        return { type };
      default:
        return fail(
          p("type"),
          type === undefined
            ? "missing"
            : `unknown type ${JSON.stringify(type)}`,
        );
    }
  }

  private table(v: Obj, path: string): UiNode {
    const columns: UiColumn[] = arr(v.columns, `${path}.columns`, 50).map(
      (c, i) => {
        const cp = `${path}.columns[${i}]`;
        if (!isObj(c)) {
          const label = str(c, cp);
          return { key: label, label, align: "start" };
        }
        const key = str(c.key ?? c.label, `${cp}.key`);
        return {
          key,
          label: optStr(c.label, `${cp}.label`) ?? key,
          align: oneOf(
            c.align,
            `${cp}.align`,
            ["start", "center", "end"],
            "start",
          ),
        };
      },
    );
    if (columns.length === 0) fail(`${path}.columns`, "needs at least one");
    const rows = arr(v.rows, `${path}.rows`, MAX_ROWS).map((r, i) => {
      const rp = `${path}.rows[${i}]`;
      const row: Record<string, Cell> = {};
      if (Array.isArray(r)) {
        columns.forEach((c, j) => {
          row[c.key] = cell(r[j], `${rp}[${j}]`);
        });
      } else if (isObj(r)) {
        for (const c of columns) row[c.key] = cell(r[c.key], `${rp}.${c.key}`);
      } else {
        fail(rp, "expected an array or object");
      }
      return row;
    });
    // Numeric columns read better end-aligned unless the agent said otherwise.
    for (const c of columns) {
      const given = v.columns as Json[];
      const raw = given[columns.indexOf(c)];
      const explicit = isObj(raw) && raw.align !== undefined;
      if (
        !explicit &&
        rows.length > 0 &&
        rows.every((r) => typeof r[c.key] === "number" || r[c.key] === null)
      ) {
        c.align = "end";
      }
    }
    return {
      type: "table",
      columns,
      rows,
      sortable: v.sortable !== false,
      caption: optStr(v.caption, `${path}.caption`),
    };
  }

  private chart(v: Obj, path: string): UiNode {
    const labels = arr(v.labels, `${path}.labels`, MAX_POINTS).map((l, i) =>
      str(l, `${path}.labels[${i}]`),
    );
    const series = arr(v.series, `${path}.series`, MAX_SERIES).map((s, i) => {
      const sp = `${path}.series[${i}]`;
      if (!isObj(s)) fail(sp, "expected an object");
      const values = arr(s.values, `${sp}.values`, MAX_POINTS).map((n, j) =>
        num(n, `${sp}.values[${j}]`),
      );
      if (values.length !== labels.length) {
        fail(
          `${sp}.values`,
          `has ${values.length} values for ${labels.length} labels`,
        );
      }
      return {
        name: optStr(s.name, `${sp}.name`) ?? `Series ${i + 1}`,
        values,
      };
    });
    if (labels.length === 0) fail(`${path}.labels`, "needs at least one");
    if (series.length === 0) fail(`${path}.series`, "needs at least one");
    return {
      type: "chart",
      kind: oneOf(v.kind, `${path}.kind`, ["bar", "line"], "bar"),
      title: optStr(v.title, `${path}.title`),
      labels,
      series,
      unit: optStr(v.unit, `${path}.unit`),
    };
  }
}

/** Validates and normalises one ```ui block's source. Never throws. */
export function parseUiSpec(source: string): UiParseResult {
  let json: Json;
  try {
    json = JSON.parse(source);
  } catch (e) {
    return {
      ok: false,
      error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  try {
    return { ok: true, node: new Parser().node(json, "spec", 0) };
  } catch (e) {
    if (e instanceof SpecError) return { ok: false, error: e.message };
    throw e;
  }
}

export function formatCell(value: Cell): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  return value;
}

// Cells can't contain a bare `|` or a newline in a Markdown table.
function mdCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function mdTable(header: string[], rows: string[][]): string {
  return [
    `| ${header.map(mdCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`),
  ].join("\n");
}

/** A readable plain-text (Markdown) version of a spec, for copying. */
export function uiSpecToText(node: UiNode): string {
  const join = (nodes: UiNode[]) =>
    nodes.map(uiSpecToText).filter(Boolean).join("\n\n");
  switch (node.type) {
    case "stack":
      return join(node.children);
    case "heading":
      return `${"#".repeat(node.level + 1)} ${node.text}`;
    case "text":
      return node.text;
    case "table": {
      const table = mdTable(
        node.columns.map((c) => c.label),
        node.rows.map((r) => node.columns.map((c) => formatCell(r[c.key]))),
      );
      return node.caption ? `${node.caption}\n\n${table}` : table;
    }
    case "stats":
      return node.items
        .map(
          (s) =>
            `- ${s.label}: ${s.value}${s.change ? ` (${s.change})` : ""}${
              s.description ? ` — ${s.description}` : ""
            }`,
        )
        .join("\n");
    case "chart": {
      const unit = node.unit ? ` (${node.unit})` : "";
      const table = mdTable(
        ["", ...node.series.map((s) => `${s.name}${unit}`)],
        node.labels.map((label, i) => [
          label,
          ...node.series.map((s) => s.values[i].toLocaleString()),
        ]),
      );
      return node.title ? `${node.title}\n\n${table}` : table;
    }
    case "keyValue": {
      const items = node.items
        .map((i) => `- ${i.label}: ${formatCell(i.value)}`)
        .join("\n");
      return node.title ? `${node.title}\n\n${items}` : items;
    }
    case "list":
      return node.items
        .map(
          (item, i) =>
            `${node.ordered ? `${i + 1}.` : "-"} ${item.title}${
              item.badge ? ` [${item.badge}]` : ""
            }${item.description ? ` — ${item.description}` : ""}`,
        )
        .join("\n");
    case "progress":
      return `${node.label}: ${node.value.toLocaleString()} / ${node.max.toLocaleString()} (${Math.round(
        (node.value / node.max) * 100,
      )}%)`;
    case "badge":
      return `[${node.label}]`;
    case "status":
      return `● ${node.label}`;
    case "card":
      return [
        node.title && `### ${node.title}`,
        node.description,
        join(node.children),
      ]
        .filter(Boolean)
        .join("\n\n");
    case "tabs":
      return node.tabs
        .map((t) =>
          [`### ${t.label}`, join(t.children)].filter(Boolean).join("\n\n"),
        )
        .join("\n\n");
    case "code":
      return `\`\`\`${node.language ?? ""}\n${node.code}\n\`\`\``;
    case "callout":
      return `> ${node.title}${node.text ? `\n> ${node.text.replace(/\n/g, "\n> ")}` : ""}`;
    case "choices":
      return [node.prompt, node.options.map((o) => `- ${o.label}`).join("\n")]
        .filter(Boolean)
        .join("\n\n");
    case "divider":
      return "---";
  }
}

// A closed ```ui (or ~~~ui) fence: the opening fence's run of backticks or
// tildes, then the same run closing it on a line of its own.
const UI_FENCE = /^([`~]{3,})[ \t]*ui[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/gm;

/**
 * A message's text with each valid ```ui block swapped for its plain-text
 * version — what Copy puts on the clipboard. Invalid blocks stay as written.
 */
export function uiBlocksToText(markdown: string): string {
  return markdown.replace(UI_FENCE, (whole, _fence: string, body: string) => {
    const parsed = parseUiSpec(body);
    return parsed.ok ? uiSpecToText(parsed.node) : whole;
  });
}
