// The settings registry: the nav's groups and panels (label, icon, the
// subtitle under the panel heading) and the search catalog. Add a panel or a
// searchable setting here; the side nav, the panel heading and the search
// results all read from these lists.
import type { IconType } from "@astryxdesign/core/Icon";
import {
  Bot,
  Bug,
  CircleAlert,
  Code,
  Fingerprint,
  Info,
  Keyboard,
  ListCollapse,
  MessagesSquare,
  MoveVertical,
  SquareCode,
  Type,
} from "lucide-react";

export type PanelId =
  | "agents"
  | "chat"
  | "fonts"
  | "editor"
  | "debug"
  | "crashlog"
  | "about";

export interface PanelConfig {
  id: PanelId;
  label: string;
  icon: IconType;
  description: string;
}

export const PANEL_GROUPS: { label: string; panels: PanelConfig[] }[] = [
  {
    label: "Agents",
    panels: [
      {
        id: "agents",
        label: "Agents",
        icon: Bot,
        description:
          "Providers and external agents the chat bar can pick from.",
      },
    ],
  },
  {
    label: "Preferences",
    panels: [
      {
        id: "chat",
        label: "Chat",
        icon: MessagesSquare,
        description: "How the message box sends and grows, and how turns fold.",
      },
      {
        id: "fonts",
        label: "Fonts",
        icon: Type,
        description: "Families and sizes for interface and code text.",
      },
      {
        id: "editor",
        label: "External editor",
        icon: SquareCode,
        description: "What the top bar's Open button runs.",
      },
      {
        id: "debug",
        label: "Debug",
        icon: Bug,
        description: "Tools for inspecting ai leash itself.",
      },
    ],
  },
  {
    label: "App",
    panels: [
      {
        id: "crashlog",
        label: "Crash log",
        icon: CircleAlert,
        description: "Crashes ai leash recorded, for bug reports.",
      },
      {
        id: "about",
        label: "About",
        icon: Info,
        description: "Version and source.",
      },
    ],
  },
];

export const PANELS: PanelConfig[] = PANEL_GROUPS.flatMap((g) => g.panels);

export function panelConfig(id: PanelId): PanelConfig {
  return PANELS.find((p) => p.id === id) ?? PANELS[0];
}

export interface SearchableSetting {
  title: string;
  description: string;
  panel: PanelId;
  icon: IconType;
  /** Extra words people reach for that aren't on the label. */
  keywords?: string;
}

/**
 * The search catalog — a list rather than something derived from the rendered
 * rows, so a setting stays findable by the words people actually use.
 */
export const SEARCHABLE_SETTINGS: SearchableSetting[] = [
  {
    title: "Agents",
    description: "Add, edit, turn off or delete an agent",
    panel: "agents",
    icon: Bot,
    keywords: "ollama acp claude copilot openai api key provider backend",
  },
  {
    title: "Default agent",
    description: "The agent new conversations start with",
    panel: "agents",
    icon: Bot,
  },
  {
    title: "Compose mode",
    description: "Enter adds a new line, Ctrl+Enter sends",
    panel: "chat",
    icon: Keyboard,
    keywords: "send enter shortcut",
  },
  {
    title: "Collapse finished turns",
    description: "Fold a finished turn into one Worked for row",
    panel: "chat",
    icon: ListCollapse,
  },
  {
    title: "Max chat box height",
    description: "Lines the message box grows to before it scrolls",
    panel: "chat",
    icon: MoveVertical,
    keywords: "composer rows lines",
  },
  {
    title: "Interface font",
    description: "Family and size of normal text",
    panel: "fonts",
    icon: Type,
    keywords: "text size typeface",
  },
  {
    title: "Code font",
    description: "Family and size of code, terminals and the editor",
    panel: "fonts",
    icon: Code,
    keywords: "monospace text size typeface terminal",
  },
  {
    title: "Editor command",
    description: "The command the Open button runs",
    panel: "editor",
    icon: SquareCode,
    keywords: "ide vscode code zed cursor open",
  },
  {
    title: "Debug mode",
    description: "The ACP Events panel and its button",
    panel: "debug",
    icon: Bug,
    keywords: "acp events log",
  },
  {
    title: "Show IDs in the top bar",
    description: "Project, conversation and session ids",
    panel: "debug",
    icon: Fingerprint,
  },
  {
    title: "Crash log",
    description: "Panics and errors, for bug reports",
    panel: "crashlog",
    icon: CircleAlert,
    keywords: "error panic",
  },
  {
    title: "Version",
    description: "Version, commit and source code",
    panel: "about",
    icon: Info,
    keywords: "about github",
  },
];

export function settingMatchesSearch(
  setting: SearchableSetting,
  normalizedQuery: string,
): boolean {
  return [
    setting.title,
    setting.description,
    setting.keywords ?? "",
    panelConfig(setting.panel).label,
  ].some((s) => s.toLowerCase().includes(normalizedQuery));
}
