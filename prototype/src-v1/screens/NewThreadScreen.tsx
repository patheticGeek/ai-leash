import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { BookOpen, FileText, Sparkles, Zap } from "lucide-react";
import { CheckoutBar, Composer, SlashMenu } from "../chat/Composer";
import AppFrame from "../shell/AppFrame";
import SidePanel from "../shell/SidePanel";

const styles = stylex.create({
  page: { minHeight: "100%" },
});

// Starter prompts: what people actually open a thread in a repo to do.
const STARTERS = [
  { h: "Plan this as board tasks", b: "Break a change into tasks with epics, priorities and sizes" },
  { h: "Review the current diff", b: "Read what changed on this branch and flag problems" },
  { h: "Run the tests and fix failures", b: "Use the test Action, then fix what breaks" },
  { h: "Explain how this part works", b: "Walk through a feature from the docs and the code" },
];

/**
 * A new thread, on the ai-chat-landing template: a centred column with the
 * heading, the composer (our pickers and the worktree bar under it), what
 * context the agent will start with, and starter prompts.
 */
export default function NewThreadScreen({ isSlashOpen = false }: { isSlashOpen?: boolean }) {
  return (
    <AppFrame project="ai-leash" title="New thread" end={<SidePanel tab="files" />}>
      <Layout
        height="fill"
        contentWidth={720}
        padding={6}
        content={
          <LayoutContent role="main">
            <VStack gap={6} vAlign="center" xstyle={styles.page}>
              <VStack gap={1}>
                <HStack gap={2} align="center">
                  <Icon icon={Sparkles} size="md" color="accent" />
                  <Text type="large" color="secondary">
                    New thread in ai-leash
                  </Text>
                </HStack>
                <Heading level={1} type="display-3">
                  What should the agent work on?
                </Heading>
              </VStack>
              <VStack gap={0}>
                {isSlashOpen && <SlashMenu />}
                <Composer
                  agent="Claude Code · Opus 5.5"
                  effort="High"
                  mode="Default"
                  value={isSlashOpen ? "/" : undefined}
                  placeholder="Describe the task, / for commands, ! for shell"
                />
                <CheckoutBar worktree="primary" branch="astryx-migration" />
              </VStack>
              <HStack gap={1} align="center" wrap="wrap">
                <Text type="supporting" color="secondary">
                  Starts with
                </Text>
                <Token size="sm" icon={<Icon icon={FileText} size="xsm" />} label="AGENTS.md" />
                <Token size="sm" icon={<Icon icon={BookOpen} size="xsm" />} label="Project memory" />
                <Token size="sm" icon={<Icon icon={Sparkles} size="xsm" />} label="3 skills" />
                <Token size="sm" icon={<Icon icon={Zap} size="xsm" />} label="4 actions" />
              </HStack>
              <Grid columns={{ minWidth: 300 }} gap={2}>
                {STARTERS.map((s) => (
                  <ClickableCard key={s.h} label={s.h} variant="muted" padding={3} onClick={() => {}}>
                    <VStack gap={0.5}>
                      <Heading level={4}>{s.h}</Heading>
                      <Text type="supporting" color="secondary">
                        {s.b}
                      </Text>
                    </VStack>
                  </ClickableCard>
                ))}
              </Grid>
            </VStack>
          </LayoutContent>
        }
      />
    </AppFrame>
  );
}
