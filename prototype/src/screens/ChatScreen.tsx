// Chat — app frame + ide split; the centre is the ai-chat template's
// ChatLayout with the composer dock in its composer slot.
import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { ChatLayout } from "@astryxdesign/core/Chat";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import {
  ComposerDock,
  ElicitationPrompt,
  MessageComposer,
  PermissionPrompt,
  RateLimitNotice,
  TaskLinkNotice,
} from "../chat/Composer";
import Transcript from "../chat/Transcript";
import AppFrame from "../shell/AppFrame";
import PaneTabs from "../shell/PaneTabs";
import SidePanel, { type PanelTab } from "../shell/SidePanel";
import TitleBar, { RunControls } from "../shell/TitleBar";
import Workspace from "../shell/Workspace";
import { VStack } from "@astryxdesign/core/Stack";

const styles = stylex.create({
  fill: { height: "100%", minHeight: 0 },
});

export type ChatVariant = "working" | "permission" | "question";

const CENTER_TABS = [
  { value: "agent", label: "Agent" },
  { value: "sub", label: "Check drag between epic rows" },
];

export default function ChatScreen({ variant = "working" }: { variant?: ChatVariant }) {
  const [centerTab, setCenterTab] = useState("agent");
  const panelTab: PanelTab = variant === "working" ? "files" : variant === "permission" ? "subagents" : "actions";
  const box =
    variant === "permission" ? (
      <PermissionPrompt />
    ) : variant === "question" ? (
      <ElicitationPrompt />
    ) : (
      <MessageComposer isWorking queued={["Also run the board tests once the edit lands"]} />
    );
  const top =
    variant === "permission" ? (
      <VStack gap={2}>
        <RateLimitNotice />
        <TaskLinkNotice />
      </VStack>
    ) : undefined;

  return (
    <AppFrame
      selection={{ kind: "chat", id: "c42" }}
      titleBar={
        <TitleBar
          icon={<Icon icon={ChatBubbleLeftRightIcon} size="sm" color="secondary" />}
          title="#42 Astryx: board on the kanban template"
          subtitle="ai-leash · task-42 · Claude Code"
          controls={<RunControls />}
        />
      }
    >
      <Workspace
        center={
          <Layout
            height="fill"
            header={
              <LayoutHeader padding={0}>
                <PaneTabs label="Chat tabs" tabs={CENTER_TABS} value={centerTab} onChange={setCenterTab} />
              </LayoutHeader>
            }
            content={
              <LayoutContent padding={0} isScrollable={false}>
                <ChatLayout
                  density="spacious"
                  xstyle={styles.fill}
                  composer={
                    <ComposerDock
                      top={top}
                      box={box}
                      checkout={{ worktree: "task-42", branch: "task/42-astryx-board" }}
                    />
                  }
                >
                  <Transcript />
                </ChatLayout>
              </LayoutContent>
            }
          />
        }
        panel={<SidePanel initialTab={panelTab} />}
      />
    </AppFrame>
  );
}
