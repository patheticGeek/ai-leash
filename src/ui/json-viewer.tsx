import { useState } from "react";
import { cn } from "@/lib/utils";

function isExpandable(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

function valueClassName(value: unknown): string {
  if (value === null || value === undefined) return "text-zinc-600";
  switch (typeof value) {
    case "string":
      return "text-emerald-400";
    case "number":
      return "text-sky-400";
    case "boolean":
      return "text-amber-400";
    default:
      return "text-zinc-400";
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
      <div className="pl-4 leading-relaxed">
        {label !== undefined && (
          <span className="text-zinc-500">{label}: </span>
        )}
        <span className={valueClassName(value)}>{formatPrimitive(value)}</span>
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
        className={cn(
          "-ml-4 flex w-[calc(100%+1rem)] items-center gap-1 rounded pl-4 text-left leading-relaxed",
          !empty && "cursor-pointer hover:bg-white/5",
        )}
      >
        <span className="w-3 shrink-0 text-zinc-600">
          {!empty && (expanded ? "▾" : "▸")}
        </span>
        {label !== undefined && (
          <span className="text-zinc-500">{label}: </span>
        )}
        <span className="text-zinc-600">
          {open}
          {!expanded && !empty && "…"}
          {(empty || !expanded) && close}
          {!expanded && !empty && (
            <span className="ml-1 text-zinc-700">
              {entries.length} {isArray ? "items" : "keys"}
            </span>
          )}
        </span>
      </button>
      {expanded && !empty && (
        <div className="ml-1.5 border-l border-white/5 pl-2">
          {entries.map(([key, val]) => (
            <JsonNode
              key={key}
              label={isArray ? undefined : key}
              value={val}
              depth={depth + 1}
              defaultCollapseDepth={defaultCollapseDepth}
            />
          ))}
          <div className="pl-4 text-zinc-600">{close}</div>
        </div>
      )}
    </div>
  );
}

/** Renders arbitrary JSON-ish data as a collapsible tree — object/array nodes
 * can be toggled open or closed, rather than dumping the whole structure as
 * one long preformatted blob. `defaultCollapseDepth` controls how many
 * levels start expanded (0 = everything starts collapsed, including the
 * root). */
export function JsonViewer({
  data,
  defaultCollapseDepth = 2,
  className,
}: {
  data: unknown;
  defaultCollapseDepth?: number;
  className?: string;
}) {
  return (
    <div className={cn("font-mono text-[11px]", className)}>
      <JsonNode
        value={data}
        depth={0}
        defaultCollapseDepth={defaultCollapseDepth}
      />
    </div>
  );
}
