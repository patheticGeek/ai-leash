import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { StackItem } from "@astryxdesign/core/Layout";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import {
  Bot,
  Bug,
  Code2,
  Cpu,
  FileWarning,
  Info,
  Keyboard,
  MessageSquare,
  Minimize2,
  Pencil,
  Plus,
  Rows3,
  Search,
  Server,
  Terminal,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import ChatScreen from "./ChatScreen";
import Logo from "../shell/Logo";

export type SettingsPanel = "agents" | "chat" | "fonts" | "editor" | "debug" | "crashlog" | "about";

const CONTROL_WIDTH = 220;

const styles = stylex.create({
  shell: { height: "min(760px, calc(100dvh - 2rem))" },
  nav: { flexShrink: 0 },
  navSection: { paddingBlock: spacingVars["--spacing-1"] },
  textCol: { maxWidth: 440 },
});

const GROUPS: { label: string; panels: { id: SettingsPanel; label: string; icon: LucideIcon; description: string }[] }[] = [
  {
    label: "Agents",
    panels: [{ id: "agents", label: "Agents", icon: Bot, description: "Providers and external agents the chat bar can pick from" }],
  },
  {
    label: "Preferences",
    panels: [
      { id: "chat", label: "Chat", icon: MessageSquare, description: "How the message box and transcript behave" },
      { id: "fonts", label: "Fonts", icon: Type, description: "Interface and code text" },
      { id: "editor", label: "External editor", icon: Code2, description: "What the title bar's Open button runs" },
      { id: "debug", label: "Debug", icon: Bug, description: "Inspect ai leash's own ACP connections" },
    ],
  },
  {
    label: "App",
    panels: [
      { id: "crashlog", label: "Crash log", icon: FileWarning, description: "Errors ai leash caught, kept on this computer" },
      { id: "about", label: "About", icon: Info, description: "Version and links" },
    ],
  },
];

function SettingsCard({ title, children, action }: { title?: string; children: ReactNode[] | ReactNode; action?: ReactNode }) {
  const rows = Array.isArray(children) ? children : [children];
  return (
    <VStack gap={1.5}>
      {title && (
        <HStack align="center" justify="between">
          <Text type="supporting" weight="semibold" color="secondary">
            {title}
          </Text>
          {action}
        </HStack>
      )}
      <Card padding={0} width="100%" variant="muted">
        <VStack gap={0}>
          {rows.map((row, i) => (
            <VStack key={i} gap={0}>
              {i > 0 && <Divider variant="subtle" />}
              {row}
            </VStack>
          ))}
        </VStack>
      </Card>
    </VStack>
  );
}

function SettingsRow({ icon, title, description, control }: { icon: LucideIcon; title: string; description?: ReactNode; control?: ReactNode }) {
  return (
    <HStack padding={3} gap={3} align="center">
      <StackItem size="fill">
        <HStack gap={2} align="start">
          <Icon icon={icon} size="sm" color="secondary" />
          <VStack gap={0.5} xstyle={styles.textCol}>
            <Text weight="medium">{title}</Text>
            {description && (
              <Text type="supporting" color="secondary">
                {description}
              </Text>
            )}
          </VStack>
        </HStack>
      </StackItem>
      {control}
    </HStack>
  );
}

function AgentsPanel() {
  const cards = [
    { icon: Terminal, label: "Claude Code", sub: "ACP · npx -y @agentclientprotocol/claude-agent-acp@latest", on: true, isDefault: true },
    { icon: Terminal, label: "GitHub Copilot", sub: "ACP · copilot --acp", on: true },
    { icon: Cpu, label: "Local Ollama", sub: "Ollama · localhost:11434 · 9 models", on: true },
    { icon: Server, label: "OpenRouter", sub: "OpenAI-compatible · openrouter.ai/api/v1 · key in keychain", on: false },
  ];
  return (
    <SettingsCard
      title="Agents"
      action={<Button variant="ghost" size="sm" label="Add an agent" icon={<Icon icon={Plus} size="sm" />} />}
    >
      {cards.map((c) => (
        <SettingsRow
          key={c.label}
          icon={c.icon}
          title={c.isDefault ? `${c.label} · default for new conversations` : c.on ? c.label : `${c.label} (turned off)`}
          description={c.sub}
          control={
            <HStack gap={1} align="center">
              {!c.isDefault && c.on && <Button variant="ghost" size="sm" label="Make default" />}
              <Switch label={`Enable ${c.label}`} isLabelHidden size="sm" value={c.on} onChange={() => {}} />
              <IconButton variant="ghost" size="sm" label="Edit" icon={<Icon icon={Pencil} size="xsm" />} />
              <IconButton variant="ghost" size="sm" label="Delete" icon={<Icon icon={Trash2} size="xsm" />} />
            </HStack>
          }
        />
      ))}
    </SettingsCard>
  );
}

function ChatPanel() {
  return (
    <SettingsCard title="Message box and transcript">
      <SettingsRow icon={Keyboard} title="Compose mode" description="Enter adds a new line and Ctrl+Enter sends. Off: Enter sends, Shift+Enter adds a line." control={<Switch label="Compose mode" isLabelHidden value={false} onChange={() => {}} />} />
      <SettingsRow icon={Minimize2} title="Collapse finished turns" description="Fold a finished turn's thinking and tool calls into one Worked for row." control={<Switch label="Collapse finished turns" isLabelHidden value onChange={() => {}} />} />
      <SettingsRow icon={Rows3} title="Max chat box height" description="Lines the message box grows to before it scrolls (3 to 12)." control={<TextInput label="Max chat box height" isLabelHidden width={CONTROL_WIDTH} value="6" onChange={() => {}} />} />
    </SettingsCard>
  );
}

function FontsPanel() {
  return (
    <VStack gap={4}>
      <SettingsCard title="Interface text">
        <SettingsRow icon={Type} title="Font family" description="Empty uses Instrument Sans. A comma-separated list works." control={<HStack gap={1}><TextInput label="Interface font family" isLabelHidden width={CONTROL_WIDTH} placeholder="Instrument Sans" value="" onChange={() => {}} /><Button variant="secondary" label="Browse" /></HStack>} />
        <SettingsRow icon={Type} title="Size" description="Pixels, 8 to 32. Scales every piece of interface text." control={<TextInput label="Interface font size" isLabelHidden width={CONTROL_WIDTH} value="14" onChange={() => {}} />} />
      </SettingsCard>
      <SettingsCard title="Code text">
        <SettingsRow icon={Code2} title="Font family" description="Code blocks, tool output, terminals and the file editor." control={<HStack gap={1}><TextInput label="Code font family" isLabelHidden width={CONTROL_WIDTH} placeholder="JetBrains Mono" value="" onChange={() => {}} /><Button variant="secondary" label="Browse" /></HStack>} />
        <SettingsRow icon={Code2} title="Size" description="Pixels, 8 to 32. Open terminals resize to fit." control={<TextInput label="Code font size" isLabelHidden width={CONTROL_WIDTH} value="13" onChange={() => {}} />} />
      </SettingsCard>
      <CodeBlock code={"fn main() {\n    println!(\"The quick brown fox\");\n}"} language="rust" title="Preview" width="100%" size="sm" />
    </VStack>
  );
}

function EditorPanel() {
  return (
    <SettingsCard title="Open in IDE">
      <SettingsRow icon={Code2} title="Command" description="Any launcher on your PATH: zed, cursor, idea, code -n. The checkout path is added last. Never run through a shell." control={<TextInput label="Command" isLabelHidden width={CONTROL_WIDTH} placeholder="code" value="zed" onChange={() => {}} />} />
    </SettingsCard>
  );
}

function DebugPanel() {
  return (
    <SettingsCard title="Debug mode">
      <SettingsRow icon={Bug} title="Enable debug mode" description="Adds a bug button to the title bar that opens the ACP Events panel. Events stay in memory only." control={<Switch label="Enable debug mode" isLabelHidden value onChange={() => {}} />} />
      <SettingsRow icon={Info} title="Show IDs in title bar" description="project id / conversation id / ACP session id" control={<Switch label="Show IDs in title bar" isLabelHidden value={false} onChange={() => {}} />} />
    </SettingsCard>
  );
}

const LOG = `2026-11-23 09:14:02 ERROR acp::process  agent "GitHub Copilot" exited during initialize (code 1)
  stderr: Error: not signed in. Run \`copilot auth login\`.
2026-11-22 18:40:51 PANIC pty.rs:212  called \`Result::unwrap()\` on an \`Err\` value: Os { code: 5, kind: Other, message: "Input/output error" }
2026-11-22 18:40:51 WARN  frontend    ResizeObserver loop completed with undelivered notifications`;

function CrashLogPanel() {
  return (
    <VStack gap={2}>
      <HStack gap={1} justify="end">
        <Button variant="ghost" size="sm" label="Refresh" />
        <Button variant="ghost" size="sm" label="Copy" />
        <Button variant="ghost" size="sm" label="Clear" />
      </HStack>
      <CodeBlock code={LOG} language="plaintext" width="100%" size="sm" isWrapped hasLanguageLabel={false} title="~/.config/ai-leash/crash.log" />
    </VStack>
  );
}

function AboutPanel() {
  return (
    <VStack gap={4}>
      <HStack>
        <Logo size="lg" />
      </HStack>
      <SettingsCard>
        <SettingsRow icon={Info} title="Version" description="0.1.0 · commit f235337 · dev build" />
        <SettingsRow icon={Code2} title="Source code" description={<Link href="#">github.com/patheticGeek/ai-leash</Link>} />
      </SettingsCard>
      <Text type="supporting" color="secondary">
        A desktop agentic harness. No telemetry.
      </Text>
    </VStack>
  );
}

const BODIES: Record<SettingsPanel, () => ReactNode> = {
  agents: AgentsPanel,
  chat: ChatPanel,
  fonts: FontsPanel,
  editor: EditorPanel,
  debug: DebugPanel,
  crashlog: CrashLogPanel,
  about: AboutPanel,
};

export default function SettingsScreen({ panel }: { panel: SettingsPanel }) {
  const config = GROUPS.flatMap((g) => g.panels).find((p) => p.id === panel)!;
  const Body = BODIES[panel];
  return (
    <>
      <ChatScreen variant="working" />
      <Dialog isOpen onOpenChange={() => {}} purpose="form" width={1000} maxHeight="min(760px, calc(100dvh - 2rem))" padding={0}>
        <VStack xstyle={styles.shell}>
          <Layout
            start={
              <SideNav
                aria-label="Settings sections"
                xstyle={styles.nav}
                header={
                  <HStack gap={2} align="center" paddingInline={2} minHeight={32}>
                    <Heading level={4} accessibilityLevel={1}>
                      Settings
                    </Heading>
                  </HStack>
                }
                topContent={<TextInput label="Search settings" isLabelHidden placeholder="Search settings" size="sm" width="100%" startIcon={Search} value="" onChange={() => {}} />}
              >
                {GROUPS.map((g) => (
                  <SideNavSection key={g.label} title={g.label} xstyle={styles.navSection}>
                    {g.panels.map((p) => (
                      <SideNavItem key={p.id} label={p.label} icon={<Icon icon={p.icon} size="sm" color="primary" />} isSelected={p.id === panel} onClick={() => {}} />
                    ))}
                  </SideNavSection>
                ))}
              </SideNav>
            }
            content={
              <LayoutContent isScrollable padding={4}>
                <VStack gap={4}>
                  <HStack gap={2} align="start">
                    <StackItem size="fill">
                      <VStack gap={0.5}>
                        <Heading level={2}>{config.label}</Heading>
                        <Text type="supporting" color="secondary">
                          {config.description}
                        </Text>
                      </VStack>
                    </StackItem>
                    <IconButton variant="ghost" size="sm" label="Close" icon={<Icon icon="close" size="sm" />} />
                  </HStack>
                  <Body />
                </VStack>
              </LayoutContent>
            }
          />
        </VStack>
      </Dialog>
    </>
  );
}
