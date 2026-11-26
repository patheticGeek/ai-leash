import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import {
  Table,
  type TableColumn,
  type TableSortState,
  useTableSortable,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import {
  Component,
  createContext,
  memo,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { type Cell, formatCell, parseUiSpec, type UiNode } from "@/lib/uiSpec";
import Chart from "./Chart";

// Renders a ```ui block from an agent's reply (the spec is `lib/uiSpec.ts`)
// with Astryx components, in place of the fenced code `Markdown` would
// otherwise show. While the block is still streaming it's a placeholder; an
// invalid block (bad JSON, unknown node, wrong field type) or one that
// throws while rendering falls back to its raw source with the error above
// it. Hand-written, as Astryx has no "render this JSON tree" component.

/**
 * Sends a `choices` option's message to the chat as the user's next turn.
 * Provided by the chat panel while a send is possible; with no provider
 * (or `null`, e.g. mid-reply) the options show but are disabled.
 */
export const UiSendContext = createContext<((message: string) => void) | null>(
  null,
);

const styles = stylex.create({
  block: { marginBlock: spacingVars["--spacing-2"], minWidth: 0 },
  scrollX: { overflowX: "auto", minWidth: 0 },
  text: { whiteSpace: "pre-wrap", marginBlock: 0 },
  error: { color: colorVars["--color-text-error"] },
  statValue: { fontVariantNumeric: "tabular-nums" },
  tabBody: { paddingBlockStart: spacingVars["--spacing-2"] },
});

const toneText = stylex.create({
  neutral: { color: colorVars["--color-text-secondary"] },
  info: { color: colorVars["--color-text-info"] },
  success: { color: colorVars["--color-text-success"] },
  warning: { color: colorVars["--color-text-warning"] },
  error: { color: colorVars["--color-text-error"] },
});

// Spec tones onto each component's own variant names.
const dotVariant = {
  neutral: "neutral",
  info: "accent",
  success: "success",
  warning: "warning",
  error: "error",
} as const;
const bannerStatus = {
  neutral: "info",
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
} as const;

function TableNode({ node }: { node: Extract<UiNode, { type: "table" }> }) {
  type Row = Record<string, unknown>;
  const [sort, setSort] = useState<TableSortState<string>>([]);
  const sortPlugin = useTableSortable<Row>({ sort, onSortChange: setSort });
  const data = useMemo(() => {
    const rows: Row[] = node.rows.map((r, i) => ({ ...r, __uiRow: i }));
    const [first] = sort;
    if (!first) return rows;
    const dir = first.direction === "ascending" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[first.sortKey] as Cell;
      const y = b[first.sortKey] as Cell;
      if (x === y) return 0;
      // Blanks last, whichever way.
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return (
        String(x).localeCompare(String(y), undefined, { numeric: true }) * dir
      );
    });
  }, [node.rows, sort]);
  const columns: TableColumn<Row>[] = node.columns.map((c) => ({
    key: c.key,
    header: c.label,
    align: c.align,
    sortable: node.sortable || undefined,
    renderCell: (row) => formatCell(row[c.key] as Cell),
  }));
  return (
    <VStack gap={1} xstyle={styles.scrollX}>
      {node.caption && (
        <Text type="supporting" color="secondary">
          {node.caption}
        </Text>
      )}
      <Table<Row>
        data={data}
        columns={columns}
        idKey="__uiRow"
        density="compact"
        hasHover
        plugins={node.sortable ? { sort: sortPlugin } : undefined}
      />
    </VStack>
  );
}

function TabsNode({ node }: { node: Extract<UiNode, { type: "tabs" }> }) {
  const [selected, setSelected] = useState("0");
  const tab = node.tabs[Number(selected)] ?? node.tabs[0];
  return (
    <VStack>
      <TabList value={selected} onChange={setSelected} size="sm" hasDivider>
        {node.tabs.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: tabs are positional
          <Tab key={i} value={String(i)} label={t.label} />
        ))}
      </TabList>
      <VStack gap={3} xstyle={styles.tabBody}>
        <Nodes nodes={tab.children} />
      </VStack>
    </VStack>
  );
}

function ChoicesNode({ node }: { node: Extract<UiNode, { type: "choices" }> }) {
  const send = useContext(UiSendContext);
  const [chosen, setChosen] = useState<number | null>(null);
  return (
    <VStack gap={1.5}>
      {node.prompt && <Text>{node.prompt}</Text>}
      <HStack gap={1.5} wrap="wrap">
        {node.options.map((o, i) => (
          <Button
            // biome-ignore lint/suspicious/noArrayIndexKey: options are positional
            key={i}
            label={o.label}
            size="sm"
            variant={chosen === i ? "primary" : "secondary"}
            isDisabled={!send || chosen !== null}
            tooltip={o.message !== o.label ? o.message : undefined}
            onClick={() => {
              if (!send) return;
              setChosen(i);
              send(o.message);
            }}
          />
        ))}
      </HStack>
    </VStack>
  );
}

function StatsNode({ node }: { node: Extract<UiNode, { type: "stats" }> }) {
  return (
    <Grid columns={{ minWidth: 140 }} gap={2}>
      {node.items.map((s, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tiles are positional
        <Card key={i} padding={3}>
          <VStack gap={0.5}>
            <Text type="supporting" color="secondary">
              {s.label}
            </Text>
            <Text size="xl" weight="semibold" xstyle={styles.statValue}>
              {s.value}
            </Text>
            {s.change && (
              <Text type="supporting" xstyle={toneText[s.tone ?? "neutral"]}>
                {s.change}
              </Text>
            )}
            {s.description && (
              <Text type="supporting" color="secondary">
                {s.description}
              </Text>
            )}
          </VStack>
        </Card>
      ))}
    </Grid>
  );
}

function Nodes({ nodes }: { nodes: UiNode[] }) {
  return nodes.map((n, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the tree is positional
    <Node key={i} node={n} />
  ));
}

function Node({ node }: { node: UiNode }): ReactNode {
  switch (node.type) {
    case "stack":
      return node.direction === "horizontal" ? (
        <HStack gap={3} wrap="wrap" align="center">
          <Nodes nodes={node.children} />
        </HStack>
      ) : (
        <VStack gap={3}>
          <Nodes nodes={node.children} />
        </VStack>
      );
    case "heading":
      return (
        <Heading level={(node.level + 2) as 3 | 4 | 5}>{node.text}</Heading>
      );
    case "text":
      return (
        <Text
          as="p"
          display="block"
          color={node.tone === "secondary" ? "secondary" : undefined}
          xstyle={styles.text}
        >
          {node.text}
        </Text>
      );
    case "table":
      return <TableNode node={node} />;
    case "stats":
      return <StatsNode node={node} />;
    case "chart":
      return (
        <VStack gap={1}>
          {node.title && <Text weight="medium">{node.title}</Text>}
          <Chart
            kind={node.kind}
            labels={node.labels}
            series={node.series}
            unit={node.unit}
            label={node.title}
          />
        </VStack>
      );
    case "keyValue":
      return (
        <MetadataList title={node.title}>
          {node.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
            <MetadataListItem key={i} label={item.label}>
              {formatCell(item.value)}
            </MetadataListItem>
          ))}
        </MetadataList>
      );
    case "list":
      return (
        <List
          density="compact"
          listStyle={node.ordered ? "decimal" : "none"}
          edge="flush"
        >
          {node.items.map((item, i) => (
            <ListItem
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
              key={i}
              label={item.title}
              description={
                item.description ? (
                  <Text type="supporting" color="secondary">
                    {item.description}
                  </Text>
                ) : undefined
              }
              endContent={
                item.badge ? (
                  <Badge label={item.badge} variant={item.tone ?? "neutral"} />
                ) : undefined
              }
            />
          ))}
        </List>
      );
    case "progress":
      return (
        <ProgressBar
          label={node.label}
          value={node.value}
          max={node.max}
          variant={dotVariant[node.tone]}
          hasValueLabel
        />
      );
    case "badge":
      return <Badge label={node.label} variant={node.tone} />;
    case "status":
      return (
        <HStack gap={1.5} align="center">
          <StatusDot variant={dotVariant[node.tone]} label={node.label} />
          <Text>{node.label}</Text>
        </HStack>
      );
    case "card":
      return (
        <Card padding={3}>
          <VStack gap={2}>
            {(node.title || node.description) && (
              <VStack gap={0.5}>
                {node.title && <Heading level={5}>{node.title}</Heading>}
                {node.description && (
                  <Text type="supporting" color="secondary">
                    {node.description}
                  </Text>
                )}
              </VStack>
            )}
            <Nodes nodes={node.children} />
          </VStack>
        </Card>
      );
    case "tabs":
      return <TabsNode node={node} />;
    case "code":
      return (
        <CodeBlock
          code={node.code}
          language={node.language}
          title={node.title}
          width="100%"
          size="sm"
        />
      );
    case "callout":
      return (
        <Banner
          status={bannerStatus[node.tone]}
          title={node.title}
          description={node.text}
          collapsible={false}
        />
      );
    case "choices":
      return <ChoicesNode node={node} />;
    case "divider":
      return <Divider />;
  }
}

function RawFallback({ source, error }: { source: string; error: string }) {
  return (
    <VStack gap={1} xstyle={styles.block}>
      <Text type="supporting" xstyle={styles.error}>
        Couldn't render this view — {error}
      </Text>
      <CodeBlock code={source} language="json" width="100%" size="sm" />
    </VStack>
  );
}

// A renderer bug on some odd-but-valid spec shouldn't take the transcript
// down with it: show the raw block instead.
class RenderGuard extends Component<
  { source: string; children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    return this.state.error !== null ? (
      <RawFallback source={this.props.source} error={this.state.error} />
    ) : (
      this.props.children
    );
  }
}

export interface UiBlockProps {
  /** The JSON between the fences. */
  source: string;
  /** The block's closing fence hasn't arrived yet (it's still streaming). */
  isPending?: boolean;
}

function UiBlock({ source, isPending = false }: UiBlockProps) {
  const parsed = useMemo(
    () => (isPending ? null : parseUiSpec(source)),
    [source, isPending],
  );
  if (!parsed) {
    return (
      <HStack gap={2} align="center" xstyle={styles.block}>
        <Spinner size="sm" aria-label="Rendering view" />
        <Text type="supporting" color="secondary">
          Rendering view…
        </Text>
      </HStack>
    );
  }
  if (!parsed.ok) return <RawFallback source={source} error={parsed.error} />;
  return (
    <RenderGuard source={source}>
      <VStack gap={3} xstyle={styles.block}>
        <Node node={parsed.node} />
      </VStack>
    </RenderGuard>
  );
}

export default memo(UiBlock);
