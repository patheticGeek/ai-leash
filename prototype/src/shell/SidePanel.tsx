// The tool panel — the ide template's inspector region holding ai leash's
// panel tabs. Files copies the ide file explorer (search + compact TreeList,
// spacing-4 inset, gap 2). Sub agents and Actions are records, so they are
// rows (layout docs: List in a zero-padding Section, the List owns the inset).
// Terminal copies the ide drawer's borderless CodeBlock.
import { useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon, type IconType } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TreeList, type TreeListItemData } from "@astryxdesign/core/TreeList";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CommandLineIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
  UserGroupIcon,
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
  { value: "terminal", label: "Terminal", isClosable: true },
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

export type ListState = "ready" | "empty" | "loading" | "error";

/** Loading rows: Skeletons in the shape of a compact ListItem. */
function SkeletonRows() {
  return (
    <VStack gap={4} padding={4}>
      {[0, 1, 2].map((i) => (
        <HStack key={i} gap={3} vAlign="center">
          <Skeleton width={8} height={8} radius="rounded" index={i} />
          <VStack gap={1.5}>
            <Skeleton width={220} height={12} index={i} />
            <Skeleton width={160} height={10} index={i} />
          </VStack>
        </HStack>
      ))}
    </VStack>
  );
}

/** Empty / loading / error for a panel list: compact EmptyState per Astryx. */
function ListStateView({
  state,
  empty,
  error,
}: {
  state: Exclude<ListState, "ready">;
  empty: { icon: IconType; title: string; description: string; action?: ReactNode };
  error: { title: string; description: string };
}) {
  if (state === "loading") return <SkeletonRows />;
  const isError = state === "error";
  return (
    <VStack padding={6}>
      <EmptyState
        isCompact
        icon={<Icon icon={isError ? ExclamationTriangleIcon : empty.icon} size="lg" color={isError ? "error" : "secondary"} />}
        title={isError ? error.title : empty.title}
        description={isError ? error.description : empty.description}
        actions={isError ? <Button label="Try again" size="sm" icon={<Icon icon={ArrowPathIcon} size="sm" />} /> : empty.action}
      />
    </VStack>
  );
}

function SubAgentsTab({ state = "ready" }: { state?: ListState }) {
  if (state !== "ready") {
    return (
      <ListStateView
        state={state}
        empty={{
          icon: UserGroupIcon,
          title: "No sub-agents yet",
          description: "When the agent hands work to a sub-agent with spawn_sub_agent, it shows up here.",
        }}
        error={{ title: "Couldn't load sub-agents", description: "The agent didn't answer list_sub_agents (timed out after 10s)." }}
      />
    );
  }
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

function ActionsTab({ state = "ready" }: { state?: ListState }) {
  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0}>
          {state !== "ready" ? (
            <ListStateView
              state={state}
              empty={{
                icon: CommandLineIcon,
                title: "No actions",
                description: "Save a command you run often, like a dev server or a test watcher, and start it from here.",
                action: <Button label="Add action" size="sm" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} />,
              }}
              error={{ title: "Couldn't load actions", description: ".ai-leash/actions.json: unexpected token at line 4." }}
            />
          ) : (
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
          )}
        </LayoutContent>
      }
      footer={
        state === "empty" ? undefined :
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

export default function SidePanel({ initialTab = "files", listState }: { initialTab?: PanelTab; listState?: ListState }) {
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
          {tab === "subagents" && <SubAgentsTab state={listState} />}
          {tab === "actions" && <ActionsTab state={listState} />}
          {tab === "terminal" && <TerminalTab />}
        </LayoutContent>
      }
    />
  );
}
