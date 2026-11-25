// New thread — the ai-chat-landing template inside the app frame: its 720
// column (padding 6, gap 8, vertically centred), greeting + display-2
// headline, the composer, then the template's lower block (paddingInline 3,
// gap 6) holding what replaces its category chips: the context the agent
// starts with, and the template's Grid of muted ClickableCards.
import * as stylex from "@stylexjs/stylex";
import {
  ChatComposer,
  ChatComposerInput,
} from "@astryxdesign/core/Chat";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Grid } from "@astryxdesign/core/Grid";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { useState } from "react";
import { Selector } from "@astryxdesign/core/Selector";
import { FolderIcon, FolderPlusIcon, PaperClipIcon, SparklesIcon } from "../icons-lucide";
import { CheckoutBar, ComposerPickers, commandTrigger, fileTrigger } from "../chat/Composer";
import AppFrame from "../shell/AppFrame";
import SidePanel from "../shell/SidePanel";
import TitleBar, { RunControls } from "../shell/TitleBar";
import Workspace from "../shell/Workspace";

const styles = stylex.create({
  page: { minHeight: "100%" },
  composerInput: { minHeight: 84 },
});

const STARTERS = [
  { heading: "Plan this as board tasks", body: "Break a goal into tasks on the ai-leash board" },
  { heading: "Review the current diff", body: "Read the uncommitted changes and flag problems" },
  { heading: "Run the tests and fix failures", body: "Uses the project's test Action" },
  { heading: "Explain how a part works", body: "Trace a feature through the code and docs" },
];

// The project the thread starts in. Picking one re-targets the checkout bar
// (its primary worktree + current branch), the breadcrumb and the context row.
const PROJECT_INFO: Record<string, { path: string; branch: string; startsWith: string[] }> = {
  "ai-leash": { path: "~/Projects/ai-leash", branch: "astryx-migration", startsWith: ["AGENTS.md", "docs/AGENTS.md", "Project memory", "3 skills", "4 actions"] },
  tidepool: { path: "~/Projects/tidepool", branch: "main", startsWith: ["AGENTS.md", "Project memory", "1 action"] },
  dotfiles: { path: "~/dotfiles", branch: "master", startsWith: ["Project memory"] },
};

/**
 * The heading's project picker: a ghost, label-less Selector inline in the
 * heading (work-item-detail's field-row pattern), sized to the heading.
 * Options: recent projects with their path, a divider, then "Add project…".
 */
function ProjectPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Selector
      label="Project"
      isLabelHidden
      variant="ghost"
      size="lg"
      value={value}
      onChange={(v) => {
        if (v && v !== "add") onChange(v);
      }}
      options={[
        {
          type: "section",
          title: "Recent projects",
          options: Object.entries(PROJECT_INFO).map(([name, info]) => ({
            value: name,
            label: name,
            description: info.path,
            icon: FolderIcon,
          })),
        },
        { type: "divider" },
        { value: "add", label: "Add project…", icon: FolderPlusIcon },
      ]}
      renderValue={(o) => (
        <Text type="large" as="span">
          {o.label}
        </Text>
      )}
    />
  );
}

export default function NewThreadScreen() {
  const [project, setProject] = useState("ai-leash");
  const info = PROJECT_INFO[project];
  return (
    <AppFrame
      selection={{ kind: "new" }}
      titleBar={
        <TitleBar
          crumbs={[{ label: project, href: "#/board" }, { label: "New thread" }]}
          controls={<RunControls />}
        />
      }
    >
      <Workspace
        center={
          <Layout
            height="fill"
            contentWidth={720}
            padding={6}
            content={
              <LayoutContent role="main">
                <VStack gap={8} vAlign="center" xstyle={styles.page}>
                  <VStack gap={1}>
                    <HStack gap={1} vAlign="center">
                      <Icon icon={SparklesIcon} size="md" color="accent" />
                      <Text type="large" as="h2">
                        New thread in
                      </Text>
                      <ProjectPicker value={project} onChange={setProject} />
                    </HStack>
                    <Text type="display-2" as="h1">
                      What should the agent work on?
                    </Text>
                  </VStack>

                  <VStack gap={2}>
                    <ChatComposer
                      onSubmit={() => {}}
                      placeholder="Describe the task, / for commands, ! for shell"
                      input={<ChatComposerInput triggers={[commandTrigger, fileTrigger]} xstyle={styles.composerInput} />}
                      headerActions={
                        <Button label="Attach" variant="ghost" size="sm" icon={<Icon icon={PaperClipIcon} size="sm" />} isIconOnly />
                      }
                      footerActions={<ComposerPickers />}
                    />
                    <CheckoutBar key={project} worktree="primary" branch={info.branch} />
                  </VStack>

                  <VStack gap={6} paddingInline={3}>
                    <VStack gap={2}>
                      <Text type="supporting" weight="semibold" color="secondary">
                        The agent starts with
                      </Text>
                      <HStack gap={1} wrap="wrap">
                        {info.startsWith.map((t) => (
                          <Token key={t} label={t} />
                        ))}
                      </HStack>
                    </VStack>
                    <Grid columns={{ minWidth: 280 }} gap={3}>
                      {STARTERS.map((s) => (
                        <ClickableCard key={s.heading} label={s.heading} variant="muted" padding={3} onClick={() => {}}>
                          <VStack gap={0.5}>
                            <Heading level={4}>{s.heading}</Heading>
                            <Text type="supporting" color="secondary">
                              {s.body}
                            </Text>
                          </VStack>
                        </ClickableCard>
                      ))}
                    </Grid>
                  </VStack>
                </VStack>
              </LayoutContent>
            }
          />
        }
        panel={<SidePanel />}
      />
    </AppFrame>
  );
}
