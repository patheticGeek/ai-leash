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
import { PaperClipIcon, SparklesIcon } from "@heroicons/react/24/outline";
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

export default function NewThreadScreen() {
  return (
    <AppFrame
      selection={{ kind: "new" }}
      titleBar={
        <TitleBar
          crumbs={[{ label: "ai-leash", href: "#/board" }, { label: "New thread" }]}
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
                    <HStack gap={2} vAlign="center">
                      <Icon icon={SparklesIcon} size="md" color="accent" />
                      <Text type="large" as="h2">
                        New thread in ai-leash
                      </Text>
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
                    <CheckoutBar worktree="primary" branch="astryx-migration" />
                  </VStack>

                  <VStack gap={6} paddingInline={3}>
                    <VStack gap={2}>
                      <Text type="supporting" weight="semibold" color="secondary">
                        The agent starts with
                      </Text>
                      <HStack gap={1} wrap="wrap">
                        <Token label="AGENTS.md" />
                        <Token label="docs/AGENTS.md" />
                        <Token label="Project memory" />
                        <Token label="3 skills" />
                        <Token label="4 actions" />
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
