// The tool panel — the ide template's inspector region holding ai leash's
// panel tabs. Files copies the ide file explorer (search + compact TreeList,
// spacing-4 inset, gap 2). Sub agents and Actions are records, so they are
// rows (layout docs: List in a zero-padding Section, the List owns the inset).
// Terminal copies the ide drawer's borderless CodeBlock.
import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TreeList, type TreeListItemData } from "@astryxdesign/core/TreeList";
import {
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
} from "@heroicons/react/24/outline";
import { ACTIONS, SUB_AGENTS } from "../data";
import PaneTabs from "./PaneTabs";

const styles = stylex.create({
  terminal: { width: "100%", height: "100%", borderWidth: 0, borderRadius: 0 },
});

export type PanelTab = "files" | "subagents" | "actions" | "terminal";

const TABS = [
  { value: "files", label: "Files" },
  { value: "subagents", label: "Sub agents" },
  { value: "actions", label: "Actions" },
  { value: "terminal", label: "Terminal" },
];

function buildTree(): TreeListItemData[] {
  const label = (text: string) => <Text maxLines={1}>{text}</Text>;
  const file = (id: string): TreeListItemData => ({
    id,
    label: label(id.split("/").pop()!),
    startContent: <Icon icon={DocumentTextIcon} size="xsm" />,
  });
  const folder = (id: string, children: TreeListItemData[], isExpanded = true): TreeListItemData => ({
    id,
    label: label(id.split("/").pop()!),
    startContent: <Icon icon={FolderIcon} size="xsm" />,
    isExpanded,
    children,
  });
  return [
    folder("docs", [], false),
    folder("src", [
      folder("src/app", [file("src/app/App.tsx"), file("src/app/LeftBar.tsx")]),
      folder("src/features", [
        folder("src/features/board", [
          file("src/features/board/BoardView.tsx"),
          file("src/features/board/TaskCard.tsx"),
          file("src/features/board/TaskDialog.tsx"),
        ]),
        folder("src/features/chat", [], false),
        folder("src/features/settings", [], false),
      ]),
      file("src/main.tsx"),
    ]),
    folder("src-tauri", [], false),
    file("AGENTS.md"),
    file("package.json"),
    file("vite.config.ts"),
  ];
}

function FilesTab() {
  return (
    <VStack padding={4} gap={2}>
      <TextInput
        label="Search files"
        isLabelHidden
        value=""
        placeholder="Search files"
        startIcon={MagnifyingGlassIcon}
      />
      <TreeList items={buildTree()} density="compact" />
    </VStack>
  );
}

function SubAgentsTab() {
  return (
    <List density="compact" hasDividers edge="padded">
      {SUB_AGENTS.map((s) => (
        <ListItem
          key={s.id}
          label={s.description}
          description={`${s.model} · ${s.latest}`}
          startContent={
            s.state === "running" ? (
              <StatusDot variant="accent" isPulsing label="Running" />
            ) : (
              <StatusDot
                variant={s.state === "done" ? "success" : "error"}
                label={s.state === "done" ? "Finished" : "Failed"}
              />
            )
          }
          endContent={
            <HStack gap={1} vAlign="center">
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {s.elapsed}
              </Text>
              {s.state === "running" ? (
                <IconButton variant="ghost" size="sm" label="Stop sub-agent" icon={<Icon icon={StopIcon} size="sm" />} />
              ) : (
                <IconButton
                  variant="ghost"
                  size="sm"
                  label="Open its conversation"
                  icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />}
                />
              )}
            </HStack>
          }
        />
      ))}
    </List>
  );
}

const ACTION_DOT = {
  running: { variant: "success", label: "Running" },
  failed: { variant: "error", label: "Failed" },
  exited: { variant: "neutral", label: "Exited" },
  idle: { variant: "neutral", label: "Not started" },
} as const;

function ActionsTab() {
  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0}>
          <List density="compact" hasDividers edge="padded">
            {ACTIONS.map((a) => (
              <ListItem
                key={a.name}
                label={a.name}
                description={`${a.command} · ${a.detail}`}
                startContent={<StatusDot variant={ACTION_DOT[a.state].variant} label={ACTION_DOT[a.state].label} />}
                endContent={
                  <HStack gap={1} vAlign="center">
                    {a.state === "running" ? (
                      <IconButton variant="ghost" size="sm" label={`Stop ${a.name}`} icon={<Icon icon={StopIcon} size="sm" />} />
                    ) : (
                      <IconButton variant="ghost" size="sm" label={`Run ${a.name}`} icon={<Icon icon={PlayIcon} size="sm" />} />
                    )}
                    <MoreMenu
                      size="sm"
                      label={`${a.name} options`}
                      items={[{ label: "Show output" }, { label: "Edit" }, { type: "divider" }, { label: "Delete", variant: "destructive" }]}
                    />
                  </HStack>
                }
              />
            ))}
          </List>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider padding={3}>
          <Button label="Add action" size="sm" icon={<Icon icon={PlusIcon} size="sm" />} />
        </LayoutFooter>
      }
    />
  );
}

const TERMINAL = `$ npm run tauri dev
> ai-leash@0.8.0 tauri
> tauri dev

     Running BeforeDevCommand (\`npm run dev\`)
  VITE v8.2.2  ready in 412 ms
  ➜  Local:   http://localhost:1420/
     Compiling ai-leash v0.8.0 (src-tauri)
      Finished \`dev\` profile in 9.82s
$ `;

function TerminalTab() {
  return (
    <CodeBlock
      code={TERMINAL}
      language="bash"
      container="section"
      hasLanguageLabel={false}
      hasCopyButton={false}
      size="sm"
      xstyle={styles.terminal}
    />
  );
}

export default function SidePanel({ initialTab = "files" }: { initialTab?: PanelTab }) {
  const [tab, setTab] = useState<string>(initialTab);
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader padding={0}>
          <PaneTabs label="Tool panel tabs" tabs={TABS} value={tab} onChange={setTab} hasPicker />
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0} isScrollable={tab !== "actions" && tab !== "terminal"}>
          {tab === "files" && <FilesTab />}
          {tab === "subagents" && <SubAgentsTab />}
          {tab === "actions" && <ActionsTab />}
          {tab === "terminal" && <TerminalTab />}
        </LayoutContent>
      }
    />
  );
}
