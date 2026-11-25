// Settings — the settings-dialog template over the app: Dialog 1120 wide,
// padding 0, one fixed height; Layout with the SideNav rail (Heading 4 title,
// search box in topContent, one SideNavSection per group) and a padding-4
// scrolling pane with a sticky close button, the panel heading, and
// SettingsCards of SettingsRows. SettingsCard / SettingsRow and their styles
// are copied from the template (row stacks at a 480px panel width, control
// column 192 wide, required icon per row).
import { Children, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon, type IconType } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Selector } from "@astryxdesign/core/Selector";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { HStack, Stack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { colorVars, radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  BugAntIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon,
  CloudIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  FingerPrintIcon,
  InformationCircleIcon,
  ArrowsPointingOutIcon,
  LanguageIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ServerIcon,
  TagIcon,
  TrashIcon,
} from "../icons-lucide";
import appIcon from "../assets/app-icon.svg";
import ChatScreen from "./ChatScreen";

const ROW_STACK = "@container settings-panel (max-width: 480px)";
const CONTROL_WIDTH = 192;

const styles = stylex.create({
  sideNav: { flexShrink: 0 },
  sideNavSection: { paddingBlock: spacingVars["--spacing-2"] },
  closeAnchor: { position: "sticky", insetBlockStart: 0, zIndex: 1, height: 0 },
  closeBacking: {
    display: "flex",
    backgroundColor: colorVars["--color-background-surface"],
    borderRadius: radiusVars["--radius-element"],
  },
  shell: { height: "min(800px, calc(100dvh - 2rem))" },
});

const row = stylex.create({
  panel: { containerType: "inline-size", containerName: "settings-panel" },
  line: {
    display: "flex",
    flexDirection: { default: "row", [ROW_STACK]: "column" },
    alignItems: { default: "center", [ROW_STACK]: "stretch" },
    gap: { default: spacingVars["--spacing-3"], [ROW_STACK]: spacingVars["--spacing-2"] },
  },
  textColumn: { maxWidth: { default: 420, [ROW_STACK]: "none" } },
  control: { flexShrink: 0 },
});

function SettingsCard({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <VStack gap={1.5}>
      {title != null && (
        <Text type="supporting" weight="semibold" color="secondary">
          {title}
        </Text>
      )}
      <Card padding={0} width="100%" variant="muted">
        <VStack as="ul" role="list" gap={0}>
          {rows.map((r, i) => (
            <VStack key={i} as="li" gap={0}>
              {i > 0 && <Divider variant="subtle" />}
              {r}
            </VStack>
          ))}
        </VStack>
      </Card>
    </VStack>
  );
}

function SettingsRow({
  title,
  titleAccessory,
  description,
  icon,
  control,
  detail,
}: {
  title: string;
  titleAccessory?: ReactNode;
  description?: ReactNode;
  icon: IconType;
  control?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <VStack padding={4} gap={2}>
      <Stack xstyle={row.line}>
        <StackItem size="fill">
          <HStack gap={2} align="start">
            <VStack paddingBlockStart={0.5}>
              <Icon icon={icon} size="sm" color="secondary" />
            </VStack>
            <VStack gap={0.5} xstyle={row.textColumn}>
              {titleAccessory == null ? (
                <Text type="label">{title}</Text>
              ) : (
                <HStack gap={1.5} align="center">
                  <Text type="label">{title}</Text>
                  {titleAccessory}
                </HStack>
              )}
              {description != null && (
                <Text type="supporting" color="secondary">
                  {description}
                </Text>
              )}
            </VStack>
          </HStack>
        </StackItem>
        {control != null && <VStack xstyle={row.control}>{control}</VStack>}
      </Stack>
      {detail}
    </VStack>
  );
}

type PanelId = "agents" | "chat" | "fonts" | "editor" | "debug" | "crashlog" | "about";

const PANEL_GROUPS: { label: string; panels: { id: PanelId; label: string; icon: IconType; description: string }[] }[] = [
  {
    label: "Agents",
    panels: [{ id: "agents", label: "Agents", icon: CpuChipIcon, description: "Providers and external agents the chat bar can pick from." }],
  },
  {
    label: "Preferences",
    panels: [
      { id: "chat", label: "Chat", icon: ChatBubbleLeftRightIcon, description: "How the message box sends and grows." },
      { id: "fonts", label: "Fonts", icon: LanguageIcon, description: "Families and sizes for interface and code text." },
      { id: "editor", label: "External editor", icon: CodeBracketIcon, description: "What the title bar's Open button runs." },
      { id: "debug", label: "Debug", icon: BugAntIcon, description: "Tools for inspecting ai leash itself." },
    ],
  },
  {
    label: "App",
    panels: [
      { id: "crashlog", label: "Crash log", icon: ExclamationTriangleIcon, description: "The last crash ai leash recorded, for bug reports." },
      { id: "about", label: "About", icon: InformationCircleIcon, description: "Version and source." },
    ],
  },
];
const PANELS = PANEL_GROUPS.flatMap((g) => g.panels);

function Toggle({ label, value }: { label: string; value: boolean }) {
  const [v, setV] = useState(value);
  return <Switch label={label} isLabelHidden value={v} onChange={setV} />;
}

function AgentControl({ name, isEnabled, isDefault }: { name: string; isEnabled: boolean; isDefault?: boolean }) {
  return (
    <HStack gap={2} vAlign="center">
      <Toggle label={`Turn ${name} on`} value={isEnabled} />
      <MoreMenu
        size="sm"
        label={`${name} options`}
        items={[
          ...(isDefault ? [] : [{ label: "Make default" }]),
          { label: "Edit" },
          { type: "divider" as const },
          { label: "Delete", variant: "destructive" as const },
        ]}
      />
    </HStack>
  );
}

function AgentsPanel() {
  return (
    <VStack gap={5}>
      <SettingsCard title="External agents (ACP)">
        <SettingsRow
          title="Claude Code"
          titleAccessory={<Token size="sm" label="Default" />}
          icon={CommandLineIcon}
          description="npx -y @agentclientprotocol/claude-agent-acp"
          control={<AgentControl name="Claude Code" isEnabled isDefault />}
        />
        <SettingsRow
          title="GitHub Copilot"
          icon={CommandLineIcon}
          description="copilot --acp"
          control={<AgentControl name="GitHub Copilot" isEnabled />}
        />
      </SettingsCard>
      <SettingsCard title="Built-in providers">
        <SettingsRow
          title="Local Ollama"
          icon={ServerIcon}
          description="http://localhost:11434 · 9 models"
          control={<AgentControl name="Local Ollama" isEnabled />}
        />
        <SettingsRow
          title="OpenRouter"
          icon={CloudIcon}
          description="OpenAI-compatible · turned off"
          control={<AgentControl name="OpenRouter" isEnabled={false} />}
        />
      </SettingsCard>
      <HStack>
        <Button label="Add an agent" icon={<Icon icon={PlusIcon} size="sm" />} />
      </HStack>
    </VStack>
  );
}

function ChatPanel() {
  const [height, setHeight] = useState("6");
  return (
    <VStack gap={5}>
      <SettingsCard title="Message box">
        <SettingsRow
          title="Compose mode"
          icon={ChatBubbleLeftRightIcon}
          description="Enter adds a new line and Ctrl+Enter sends. Off: Enter sends, Shift+Enter adds a line."
          control={<Toggle label="Compose mode" value={false} />}
        />
        <SettingsRow
          title="Max chat box height"
          icon={ArrowsPointingOutIcon}
          description="Lines the message box grows to before it scrolls."
          control={
            <Selector
              label="Max chat box height"
              isLabelHidden
              size="sm"
              width={CONTROL_WIDTH}
              value={height}
              onChange={(v) => setHeight(v!)}
              options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 3), label: `${i + 3} lines${i + 3 === 6 ? " (default)" : ""}` }))}
            />
          }
        />
      </SettingsCard>
    </VStack>
  );
}

function FontRows({ kind }: { kind: "Interface" | "Code" }) {
  const [family, setFamily] = useState("builtin");
  const [size, setSize] = useState(kind === "Interface" ? "14" : "12");
  const builtin = kind === "Interface" ? "Instrument Sans" : "JetBrains Mono";
  return (
    <SettingsCard title={`${kind} text`}>
      <SettingsRow
        title="Font family"
        icon={LanguageIcon}
        description={kind === "Interface" ? "Normal text throughout the app. Built-in unless you pick an installed font." : "Code blocks, tool output, terminals and the editor."}
        control={
          <Selector
            label={`${kind} font family`}
            isLabelHidden
            hasSearch
            searchPlaceholder="Search installed fonts…"
            size="sm"
            width={CONTROL_WIDTH}
            value={family}
            onChange={(v) => setFamily(v!)}
            options={[{ value: "builtin", label: builtin, description: "Built-in" }, { type: "divider" }, "Inter", "IBM Plex Sans", "Fira Code"]}
          />
        }
        detail={
          kind === "Code" ? (
            <CodeBlock code={'const leash = useAgent({ model: "opus-5.5" });'} language="typescript" width="100%" size="sm" hasCopyButton={false} hasLanguageLabel={false} />
          ) : (
            <Card padding={3} width="100%">
              <VStack gap={1}>
                <Text type="label">#42 Astryx: board on the kanban template</Text>
                <Text type="supporting" color="secondary">
                  Worked for 4m 51s · 1 thought, 4 tools used
                </Text>
              </VStack>
            </Card>
          )
        }
      />
      <SettingsRow
        title="Size"
        icon={AdjustmentsHorizontalIcon}
        control={
          <Selector
            label={`${kind} text size`}
            isLabelHidden
            size="sm"
            width={CONTROL_WIDTH}
            value={size}
            onChange={(v) => setSize(v!)}
            options={[10, 11, 12, 13, 14, 15, 16, 18].map((n) => ({ value: String(n), label: `${n} px${String(n) === (kind === "Interface" ? "14" : "12") ? " (default)" : ""}` }))}
          />
        }
      />
    </SettingsCard>
  );
}

function FontsPanel() {
  return (
    <VStack gap={5}>
      <FontRows kind="Interface" />
      <FontRows kind="Code" />
    </VStack>
  );
}

function EditorPanel() {
  const [cmd, setCmd] = useState("code");
  return (
    <VStack gap={5}>
      <SettingsCard title="Open in external editor">
        <SettingsRow
          title="Command"
          icon={CodeBracketIcon}
          description="Any launcher on your PATH (zed, cursor, code -n). The checkout path is added as the last argument."
          control={<TextInput label="Editor command" isLabelHidden size="sm" width={CONTROL_WIDTH} value={cmd} onChange={setCmd} />}
        />
      </SettingsCard>
    </VStack>
  );
}

function DebugPanel() {
  return (
    <VStack gap={5}>
      <SettingsCard title="Debug mode">
        <SettingsRow
          title="Debug mode"
          icon={BugAntIcon}
          description="Adds the ACP Events panel and the title bar's bug button."
          control={<Toggle label="Debug mode" value />}
        />
        <SettingsRow
          title="Show IDs in the title bar"
          icon={FingerPrintIcon}
          description="Conversation, session and agent ids, for bug reports."
          control={<Toggle label="Show IDs in the title bar" value={false} />}
        />
      </SettingsCard>
    </VStack>
  );
}

const CRASH = `thread 'tokio-runtime-worker' panicked at src-tauri/src/acp/process.rs:214:18:
called \`Result::unwrap()\` on an \`Err\` value: Os { code: 32, kind: BrokenPipe }
stack backtrace:
   0: rust_begin_unwind
   1: core::panicking::panic_fmt
   2: ai_leash::acp::process::AgentProcess::send
   3: ai_leash::acp::backend::AcpBackend::prompt`;

function CrashLogPanel() {
  return (
    <VStack gap={5}>
      <SettingsCard title="Last crash">
        <SettingsRow
          title="Nov 21, 2026 · 14:02"
          icon={ExclamationTriangleIcon}
          description="ai leash 0.8.0 · linux x86_64"
          control={
            <HStack gap={1}>
              <IconButton variant="ghost" size="sm" label="Refresh" icon={<Icon icon={ArrowPathIcon} size="sm" />} />
              <IconButton variant="ghost" size="sm" label="Copy" icon={<Icon icon={ClipboardDocumentIcon} size="sm" />} />
              <IconButton variant="ghost" size="sm" label="Clear" icon={<Icon icon={TrashIcon} size="sm" />} />
            </HStack>
          }
          detail={<CodeBlock code={CRASH} language="plaintext" width="100%" size="sm" hasCopyButton={false} hasLanguageLabel={false} isWrapped />}
        />
      </SettingsCard>
    </VStack>
  );
}

function AboutPanel() {
  return (
    <VStack gap={5}>
      <HStack gap={3} vAlign="center">
        <Avatar src={appIcon} name="ai leash" size="lg" shape="rounded" tooltip={false} />
        <VStack gap={0}>
          <Heading level={3}>ai leash</Heading>
          <Text color="secondary">An agentic harness for local and external coding agents</Text>
        </VStack>
      </HStack>
      <SettingsCard title="Build">
        <SettingsRow title="Version" icon={TagIcon} control={<Text color="secondary">0.8.0</Text>} />
        <SettingsRow title="Commit" icon={CodeBracketIcon} control={<Text color="secondary">f235337</Text>} />
        <SettingsRow title="Source" icon={LinkIcon} control={<Link href="#">github.com/…/ai-leash</Link>} />
      </SettingsCard>
    </VStack>
  );
}

function PanelBody({ panel }: { panel: PanelId }) {
  switch (panel) {
    case "agents":
      return <AgentsPanel />;
    case "chat":
      return <ChatPanel />;
    case "fonts":
      return <FontsPanel />;
    case "editor":
      return <EditorPanel />;
    case "debug":
      return <DebugPanel />;
    case "crashlog":
      return <CrashLogPanel />;
    case "about":
      return <AboutPanel />;
  }
}

function SettingsSideNav({ active, onSelect }: { active: PanelId; onSelect: (p: PanelId) => void }) {
  const [query, setQuery] = useState("");
  return (
    <SideNav
      aria-label="Settings sections"
      xstyle={styles.sideNav}
      header={
        <HStack gap={2} align="center" paddingInline={2} minHeight={32}>
          <Heading level={4} accessibilityLevel={1}>
            Settings
          </Heading>
        </HStack>
      }
      topContent={
        <TextInput
          label="Search settings"
          isLabelHidden
          placeholder="Search settings"
          size="sm"
          width="100%"
          hasClear
          startIcon={MagnifyingGlassIcon}
          value={query}
          onChange={setQuery}
        />
      }
    >
      {PANEL_GROUPS.map((g) => (
        <SideNavSection key={g.label} title={g.label} xstyle={styles.sideNavSection}>
          {g.panels.map((p) => (
            <SideNavItem
              key={p.id}
              label={p.label}
              icon={<Icon icon={p.icon} size="sm" color="primary" />}
              isSelected={p.id === active}
              onClick={() => onSelect(p.id)}
            />
          ))}
        </SideNavSection>
      ))}
    </SideNav>
  );
}

export default function SettingsScreen({ panel = "agents" }: { panel?: PanelId }) {
  const [active, setActive] = useState<PanelId>(panel);
  const config = PANELS.find((p) => p.id === active)!;
  return (
    <>
      <ChatScreen />
      <Dialog isOpen onOpenChange={() => {}} purpose="form" width={1120} maxHeight="min(800px, calc(100dvh - 2rem))" padding={0} aria-label="Settings">
        <VStack xstyle={styles.shell}>
          <Layout
            start={<SettingsSideNav active={active} onSelect={setActive} />}
            content={
              <LayoutContent isScrollable padding={4}>
                <HStack width="100%" justify="end" xstyle={styles.closeAnchor}>
                  <HStack xstyle={styles.closeBacking}>
                    <IconButton label="Close" variant="ghost" size="sm" icon={<Icon icon="close" size="sm" />} />
                  </HStack>
                </HStack>
                <VStack gap={4} xstyle={row.panel}>
                  <HStack gap={2} align="start">
                    <StackItem size="fill">
                      <VStack gap={0.5}>
                        <Heading level={2}>{config.label}</Heading>
                        <Text type="supporting" color="secondary">
                          {config.description}
                        </Text>
                      </VStack>
                    </StackItem>
                    <VStack aria-hidden="true" width={32} />
                  </HStack>
                  <PanelBody panel={active} />
                </VStack>
              </LayoutContent>
            }
          />
        </VStack>
      </Dialog>
    </>
  );
}

export type { PanelId };
