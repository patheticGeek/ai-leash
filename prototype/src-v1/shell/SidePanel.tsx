import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import { List, ListItem } from "@astryxdesign/core/List";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StackItem } from "@astryxdesign/core/Layout";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  borderVars,
  colorVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { TreeList, type TreeListItemData } from "@astryxdesign/core/TreeList";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import {
  Bot,
  FileCode2,
  FileText,
  Folder,
  FolderTree,
  Pencil,
  Play,
  Plus,
  Search,
  Square,
  SquareTerminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";

export type PanelTab = "files" | "subagents" | "actions" | "terminal" | "file";

const styles = stylex.create({
  fill: { height: "100%", minHeight: 0 },
  strip: {
    flexShrink: 0,
    paddingBlock: spacingVars["--spacing-1"],
    paddingInlineEnd: spacingVars["--spacing-1"],
    borderBlockEndWidth: borderVars["--border-width"],
    borderBlockEndStyle: "solid",
    borderBlockEndColor: colorVars["--color-border"],
  },
  body: { flex: 1, minHeight: 0, overflow: "auto" },
  bleed: { width: "100%", height: "100%", borderWidth: 0, borderRadius: 0 },
  // The terminal drawer docked at the bottom of the panel (ide template's
  // bottom drawer).
  drawer: {
    flexShrink: 0,
    height: 260,
    borderBlockStartWidth: borderVars["--border-width"],
    borderBlockStartStyle: "solid",
    borderBlockStartColor: colorVars["--color-border"],
  },
});

const file = (id: string, isSelected = false): TreeListItemData => ({
  id,
  label: <Text maxLines={1}>{id}</Text>,
  startContent: <Icon icon={id.endsWith(".md") ? FileText : FileCode2} size="xsm" color="secondary" />,
  isSelected,
});
const dir = (id: string, children: TreeListItemData[], isExpanded = true): TreeListItemData => ({
  id,
  label: <Text maxLines={1}>{id}</Text>,
  startContent: <Icon icon={Folder} size="xsm" color="secondary" />,
  isExpanded,
  children,
});

const TREE: TreeListItemData[] = [
  dir("docs", [], false),
  dir("src", [
    dir("app", [file("App.tsx"), file("CenterPanel.tsx"), file("LeftBar.tsx"), file("TitleBar.tsx")]),
    dir("features", [
      dir("board", [file("BoardView.tsx", true), file("TaskCard.tsx"), file("TaskDialog.tsx")]),
      dir("chat", [], false),
      dir("settings", [], false),
    ]),
    dir("themes", [], false),
    file("main.tsx"),
  ]),
  dir("src-tauri", [], false),
  file("AGENTS.md"),
  file("package.json"),
  file("vite.config.ts"),
];

const TERMINAL = `$ npm run tauri dev
> ai-leash@0.1.0 tauri
> tauri dev

     Running BeforeDevCommand (\`npm run dev\`)
  VITE v8.0.16  ready in 412 ms
  ➜  Local:   http://localhost:1420/
     Compiling ai-leash v0.1.0 (src-tauri)
      Finished \`dev\` profile in 9.84s
 [hmr] update /src/features/board/BoardView.tsx
$ `;

const EDITOR = `export default function BoardView({ projectRoot }: Props) {
  const board = useBoard(projectRoot, true);
  const [showDone, setShowDone] = useState(false);
  const [groupByEpic, setGroupByEpic] = useState(false);

  const columns = showDone ? STATUSES : STATUSES.slice(0, 4);
  return (
    <Layout
      header={<BoardToolbar board={board} />}
      content={<BoardColumns columns={columns} />}
    />
  );
}`;

function FilesTab() {
  return (
    <VStack gap={2} padding={2}>
      <TextInput label="Search files" isLabelHidden placeholder="Search files" size="sm" startIcon={Search} value="" onChange={() => {}} />
      <TreeList items={TREE} density="compact" />
    </VStack>
  );
}

function SubAgentsTab() {
  const rows = [
    { d: "Audit entry grouping for the Worked-for row", m: "claude-sonnet-5-5", s: "running", t: "1:04" },
    { d: "List every docked strip in ChatComposer", m: "claude-sonnet-5-5", s: "done", t: "38s" },
    { d: "Check board drag-and-drop against dnd-kit", m: "qwen3-coder:30b", s: "error", t: "12s" },
  ] as const;
  return (
    <List density="compact">
      {rows.map((r) => (
        <ListItem
          key={r.d}
          onClick={() => {}}
          startContent={
            r.s === "running" ? <Spinner size="sm" aria-label="Running" /> : (
              <StatusDot variant={r.s === "done" ? "success" : "error"} label={r.s} />
            )
          }
          label={r.d}
          description={`${r.m} · ${r.s === "running" ? "running" : r.s === "done" ? "finished" : "failed"} · ${r.t}`}
          endContent={
            r.s === "running" ? (
              <IconButton variant="ghost" size="sm" label="Stop" icon={<Icon icon={Square} size="xsm" />} />
            ) : (
              <IconButton variant="ghost" size="sm" label="Remove" icon={<Icon icon={X} size="sm" />} />
            )
          }
        />
      ))}
    </List>
  );
}

function ActionsTab() {
  const rows = [
    { n: "dev", c: "npm run tauri dev", s: "running" },
    { n: "lint fix", c: "npm run lint:fix", s: "exited 1" },
    { n: "storybook", c: "npm run storybook", s: "stopped" },
    { n: "docs", c: "npm run dev --prefix website", s: "stopped" },
  ];
  return (
    <VStack gap={1}>
      <List density="compact">
        {rows.map((r) => (
          <ListItem
            key={r.n}
            onClick={() => {}}
            startContent={
              <StatusDot
                variant={r.s === "running" ? "success" : r.s.startsWith("exited") ? "error" : "neutral"}
                label={r.s}
              />
            }
            label={r.n}
            description={<Text type="code" size="sm" color="secondary" maxLines={1}>{r.c}</Text>}
            endContent={
              <HStack align="center" gap={0.5}>
                <Text type="supporting" color={r.s.startsWith("exited") ? "inherit" : "secondary"}>
                  {r.s}
                </Text>
                <IconButton variant="ghost" size="sm" label="Edit" icon={<Icon icon={Pencil} size="xsm" />} />
                <IconButton variant="ghost" size="sm" label="Delete" icon={<Icon icon={Trash2} size="xsm" />} />
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={r.s === "running" ? "Stop" : "Run"}
                  icon={<Icon icon={r.s === "running" ? Square : Play} size="xsm" />}
                />
              </HStack>
            }
          />
        ))}
      </List>
      <HStack paddingInline={2}>
        <Button variant="ghost" size="sm" label="Add action" icon={<Icon icon={Plus} size="sm" />} />
      </HStack>
    </VStack>
  );
}

function Terminal() {
  return (
    <CodeBlock code={TERMINAL} language="bash" container="section" hasLanguageLabel={false} hasCopyButton={false} size="sm" xstyle={styles.bleed} />
  );
}

const TABS: { value: PanelTab; label: string; icon: typeof Bot }[] = [
  { value: "files", label: "Files", icon: FolderTree },
  { value: "subagents", label: "Sub agents", icon: Bot },
  { value: "actions", label: "Actions", icon: Zap },
  { value: "terminal", label: "Terminal", icon: SquareTerminal },
  { value: "file", label: "BoardView.tsx", icon: FileCode2 },
];

/**
 * The side panel on the ide template's inspector pane: a pill tab strip with
 * a + button, the active tool below, and optionally a terminal drawer docked
 * at the bottom (the ide template's bottom drawer).
 */
export default function SidePanel({
  tab,
  hasDrawer = false,
}: {
  tab: PanelTab;
  hasDrawer?: boolean;
}) {
  return (
    <VStack xstyle={styles.fill}>
      <HStack align="center" xstyle={styles.strip}>
        <StackItem size="fill">
          <TabList value={tab} onChange={() => {}} size="sm">
            {TABS.filter((t) => !(hasDrawer && t.value === "terminal")).map((t) => (
              <Tab key={t.value} value={t.value} label={t.label} icon={<Icon icon={t.icon} size="xsm" />} />
            ))}
          </TabList>
        </StackItem>
        <IconButton variant="ghost" size="sm" label="Open tab" tooltip="Open tab" icon={<Icon icon={Plus} size="sm" />} />
      </HStack>
      <VStack xstyle={styles.body}>
        {tab === "files" && <FilesTab />}
        {tab === "subagents" && <SubAgentsTab />}
        {tab === "actions" && <ActionsTab />}
        {tab === "terminal" && <Terminal />}
        {tab === "file" && (
          <CodeBlock code={EDITOR} language="typescript" container="section" hasLanguageLabel={false} hasCopyButton={false} hasLineNumbers size="sm" xstyle={styles.bleed} />
        )}
      </VStack>
      {hasDrawer && (
        <VStack xstyle={styles.drawer}>
          <Item
            density="compact"
            startContent={<Icon icon={SquareTerminal} size="sm" color="secondary" />}
            label={<Text type="label">dev</Text>}
            description="npm run tauri dev · running"
            endContent={<IconButton variant="ghost" size="sm" label="Hide drawer" icon={<Icon icon={X} size="sm" />} />}
          />
          <StackItem size="fill">
            <Terminal />
          </StackItem>
        </VStack>
      )}
    </VStack>
  );
}
