import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import {
  colorVars,
  typeScaleVars,
  typographyVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useRef, useState } from "react";

// A small bar/line chart for rich chat replies (`UiBlock`'s `chart` node).
// Hand-written because Astryx has no chart component: an SVG whose
// coordinate system is kept equal to its rendered pixel size (measured with a
// ResizeObserver), so axis text stays at the theme's supporting size however
// wide the transcript is. Colours are Astryx's categorical icon colours.

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface ChartProps {
  kind?: "bar" | "line";
  labels: string[];
  series: ChartSeries[];
  /** Appended to values in tooltips and the y axis, e.g. "ms" or "%". */
  unit?: string;
  /** Plot height in pixels. */
  height?: number;
  /** Accessible name for the chart. */
  label?: string;
}

const styles = stylex.create({
  svg: { display: "block", width: "100%", overflow: "visible" },
  axisText: {
    fill: colorVars["--color-text-secondary"],
    fontFamily: typographyVars["--font-family-body"],
    fontSize: typeScaleVars["--text-supporting-size"],
  },
  grid: { stroke: colorVars["--color-border"], strokeWidth: 1 },
  baseline: { stroke: colorVars["--color-border-emphasized"], strokeWidth: 1 },
  line: { fill: "none", strokeWidth: 2, strokeLinejoin: "round" },
  point: { stroke: colorVars["--color-background-body"], strokeWidth: 1.5 },
  swatch: { flexShrink: 0 },
});

// One per series, in order; wraps after eight (the spec caps series at 8).
const palette = stylex.create({
  s0: {
    fill: colorVars["--color-icon-blue"],
    stroke: colorVars["--color-icon-blue"],
  },
  s1: {
    fill: colorVars["--color-icon-orange"],
    stroke: colorVars["--color-icon-orange"],
  },
  s2: {
    fill: colorVars["--color-icon-teal"],
    stroke: colorVars["--color-icon-teal"],
  },
  s3: {
    fill: colorVars["--color-icon-purple"],
    stroke: colorVars["--color-icon-purple"],
  },
  s4: {
    fill: colorVars["--color-icon-pink"],
    stroke: colorVars["--color-icon-pink"],
  },
  s5: {
    fill: colorVars["--color-icon-yellow"],
    stroke: colorVars["--color-icon-yellow"],
  },
  s6: {
    fill: colorVars["--color-icon-green"],
    stroke: colorVars["--color-icon-green"],
  },
  s7: {
    fill: colorVars["--color-icon-cyan"],
    stroke: colorVars["--color-icon-cyan"],
  },
});
const seriesStyles = [
  palette.s0,
  palette.s1,
  palette.s2,
  palette.s3,
  palette.s4,
  palette.s5,
  palette.s6,
  palette.s7,
];
const colorOf = (i: number) => seriesStyles[i % seriesStyles.length];

// Plot geometry, in SVG units (= CSS pixels, see above).
const MARGIN = { top: 8, right: 8, bottom: 22, left: 44 };
const CHAR_WIDTH = 6.5;

// 1, 2 or 5 × a power of ten: a step that gives about `count` ticks.
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(count, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
}

function compact(n: number): string {
  return Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function Chart({
  kind = "bar",
  labels,
  series,
  unit,
  height = 200,
  label,
}: ChartProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const values = series.flatMap((s) => s.values);
  let lo = Math.min(0, ...values);
  let hi = Math.max(0, ...values);
  if (lo === hi) hi = lo + 1;
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);

  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const y = (v: number) => MARGIN.top + ((hi - v) / (hi - lo)) * plotH;
  const band = labels.length ? plotW / labels.length : 0;
  const cx = (i: number) => MARGIN.left + band * (i + 0.5);
  // Show every nth x label, so long or many labels don't overlap.
  const labelW = Math.max(...labels.map((l) => l.length)) * CHAR_WIDTH + 8;
  const every = band > 0 ? Math.max(1, Math.ceil(labelW / band)) : 1;
  const maxChars = Math.max(3, Math.floor((band * every - 4) / CHAR_WIDTH));
  const fit = (l: string) =>
    l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l;
  const withUnit = (v: number) =>
    `${v.toLocaleString()}${unit ? ` ${unit}` : ""}`;

  const groupW = band * 0.72;
  const barW = series.length ? groupW / series.length : 0;

  return (
    <VStack gap={1}>
      <svg
        ref={ref}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label ?? "Chart"}
        {...stylex.props(styles.svg)}
      >
        {width > 0 && (
          <>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotW}
                  y1={y(t)}
                  y2={y(t)}
                  {...stylex.props(t === 0 ? styles.baseline : styles.grid)}
                />
                <text
                  x={MARGIN.left - 6}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  {...stylex.props(styles.axisText)}
                >
                  {compact(t)}
                </text>
              </g>
            ))}
            {labels.map((l, i) =>
              i % every === 0 ? (
                <text
                  // biome-ignore lint/suspicious/noArrayIndexKey: labels can repeat
                  key={i}
                  x={cx(i)}
                  y={height - 6}
                  textAnchor="middle"
                  {...stylex.props(styles.axisText)}
                >
                  <title>{l}</title>
                  {fit(l)}
                </text>
              ) : null,
            )}
            {kind === "bar"
              ? series.map((s, si) =>
                  s.values.map((v, i) => {
                    const top = y(Math.max(v, 0));
                    return (
                      <rect
                        // biome-ignore lint/suspicious/noArrayIndexKey: positional data
                        key={`${si}-${i}`}
                        x={cx(i) - groupW / 2 + si * barW + 0.5}
                        y={top}
                        width={Math.max(barW - 1, 1)}
                        height={Math.max(y(Math.min(v, 0)) - top, 0)}
                        rx={2}
                        {...stylex.props(colorOf(si))}
                      >
                        <title>{`${s.name} · ${labels[i]}: ${withUnit(v)}`}</title>
                      </rect>
                    );
                  }),
                )
              : series.map((s, si) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional data
                  <g key={si}>
                    <polyline
                      points={s.values
                        .map((v, i) => `${cx(i)},${y(v)}`)
                        .join(" ")}
                      {...stylex.props(colorOf(si), styles.line)}
                    />
                    {s.values.map((v, i) => (
                      <circle
                        // biome-ignore lint/suspicious/noArrayIndexKey: positional data
                        key={i}
                        cx={cx(i)}
                        cy={y(v)}
                        r={3}
                        {...stylex.props(colorOf(si), styles.point)}
                      >
                        <title>{`${s.name} · ${labels[i]}: ${withUnit(v)}`}</title>
                      </circle>
                    ))}
                  </g>
                ))}
          </>
        )}
      </svg>
      {series.length > 1 && (
        <HStack gap={3} wrap="wrap" justify="center">
          {series.map((s, si) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: names can repeat
            <HStack key={si} gap={1} align="center">
              <svg
                width={10}
                height={10}
                aria-hidden="true"
                {...stylex.props(styles.swatch)}
              >
                <rect
                  width={10}
                  height={10}
                  rx={2}
                  {...stylex.props(colorOf(si))}
                />
              </svg>
              <Text type="supporting" color="secondary">
                {s.name}
              </Text>
            </HStack>
          ))}
        </HStack>
      )}
    </VStack>
  );
}

export default Chart;
