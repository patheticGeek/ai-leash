import {
  colorVars,
  radiusVars,
  spacingVars,
  typographyVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

const styles = stylex.create({
  root: {
    fontFamily: typographyVars["--font-family-code"],
    // The user's code font size (Settings → Preferences, `fontPreferences`).
    fontSize: "var(--al-code-size)",
  },
  leaf: {
    paddingInlineStart: spacingVars["--spacing-4"],
    lineHeight: 1.625,
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-1"],
    // Pulled out by its own chevron column so keys line up with leaves.
    marginInlineStart: `calc(-1 * ${spacingVars["--spacing-4"]})`,
    width: `calc(100% + ${spacingVars["--spacing-4"]})`,
    paddingInlineStart: spacingVars["--spacing-4"],
    paddingBlock: 0,
    paddingInlineEnd: 0,
    borderWidth: 0,
    borderRadius: radiusVars["--radius-inner"],
    backgroundColor: "transparent",
    color: "inherit",
    font: "inherit",
    lineHeight: 1.625,
    textAlign: "start",
  },
  toggleActive: {
    cursor: "pointer",
    backgroundColor: {
      default: "transparent",
      ":hover": colorVars["--color-overlay-hover"],
    },
  },
  chevron: {
    width: spacingVars["--spacing-3"],
    flexShrink: 0,
    color: colorVars["--color-text-disabled"],
  },
  // Values in the code palette (`lib/codeTheme.ts`), as in code blocks.
  key: { color: "var(--color-syntax-property)" },
  punctuation: { color: "var(--color-syntax-punctuation)" },
  count: {
    marginInlineStart: spacingVars["--spacing-1"],
    color: colorVars["--color-text-disabled"],
  },
  children: {
    marginInlineStart: spacingVars["--spacing-1-5"],
    paddingInlineStart: spacingVars["--spacing-2"],
    borderInlineStartWidth: 1,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: colorVars["--color-border"],
  },
  closing: {
    paddingInlineStart: spacingVars["--spacing-4"],
    color: colorVars["--color-text-disabled"],
  },
  nullish: { color: "var(--color-syntax-constant)" },
  string: { color: "var(--color-syntax-string)" },
  number: { color: "var(--color-syntax-number)" },
  boolean: { color: "var(--color-syntax-constant)" },
  other: { color: colorVars["--color-text-secondary"] },
});

function isExpandable(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

function valueStyle(value: unknown) {
  if (value === null || value === undefined) return styles.nullish;
  switch (typeof value) {
    case "string":
      return styles.string;
    case "number":
      return styles.number;
    case "boolean":
      return styles.boolean;
    default:
      return styles.other;
  }
}

function formatPrimitive(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

interface JsonNodeProps {
  label?: string;
  value: unknown;
  depth: number;
  defaultCollapseDepth: number;
}

function JsonNode({
  label,
  value,
  depth,
  defaultCollapseDepth,
}: JsonNodeProps) {
  const expandable = isExpandable(value);
  const [expanded, setExpanded] = useState(depth < defaultCollapseDepth);

  if (!expandable) {
    return (
      <div {...stylex.props(styles.leaf)}>
        {label !== undefined && (
          <span {...stylex.props(styles.key)}>{label}: </span>
        )}
        <span {...stylex.props(valueStyle(value))}>
          {formatPrimitive(value)}
        </span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const empty = entries.length === 0;
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        disabled={empty}
        {...stylex.props(styles.toggle, !empty && styles.toggleActive)}
      >
        <span {...stylex.props(styles.chevron)}>
          {!empty && (expanded ? "▾" : "▸")}
        </span>
        {label !== undefined && (
          <span {...stylex.props(styles.key)}>{label}: </span>
        )}
        <span {...stylex.props(styles.punctuation)}>
          {open}
          {!expanded && !empty && "…"}
          {(empty || !expanded) && close}
          {!expanded && !empty && (
            <span {...stylex.props(styles.count)}>
              {entries.length} {isArray ? "items" : "keys"}
            </span>
          )}
        </span>
      </button>
      {expanded && !empty && (
        <div {...stylex.props(styles.children)}>
          {entries.map(([key, val]) => (
            <JsonNode
              key={key}
              label={isArray ? undefined : key}
              value={val}
              depth={depth + 1}
              defaultCollapseDepth={defaultCollapseDepth}
            />
          ))}
          <div {...stylex.props(styles.closing)}>{close}</div>
        </div>
      )}
    </div>
  );
}

/** Renders arbitrary JSON-ish data as a collapsible tree — object/array nodes
 * can be toggled open or closed, rather than dumping the whole structure as
 * one long preformatted blob. `defaultCollapseDepth` controls how many
 * levels start expanded (0 = everything starts collapsed, including the
 * root). Hand-written (no Astryx/registry equivalent), styled with StyleX +
 * Astryx tokens. */
export function JsonViewer({
  data,
  defaultCollapseDepth = 2,
}: {
  data: unknown;
  defaultCollapseDepth?: number;
}) {
  return (
    <div {...stylex.props(styles.root)}>
      <JsonNode
        value={data}
        depth={0}
        defaultCollapseDepth={defaultCollapseDepth}
      />
    </div>
  );
}
