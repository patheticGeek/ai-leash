// Chat — app frame + ide split; the centre is the ai-chat template's
// ChatLayout with the composer dock in its composer slot.
import { useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { ChatLayout } from "@astryxdesign/core/Chat";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import {
  ComposerDock,
  ElicitationPrompt,
  MessageComposer,
  PermissionPrompt,
  RateLimitNotice,
  TaskLinkNotice,
} from "../chat/Composer";
import Transcript from "../chat/Transcript";
import type { CheckoutState } from "../chat/Checkout";
import AppFrame from "../shell/AppFrame";
import PaneTabs from "../shell/PaneTabs";
import SidePanel, { type ListState, type PanelTab } from "../shell/SidePanel";
import TitleBar, { RunControls } from "../shell/TitleBar";
import Workspace from "../shell/Workspace";
import { VStack } from "@astryxdesign/core/Stack";

const styles = stylex.create({
  fill: { height: "100%", minHeight: 0 },
});

export type ChatVariant = "working" | "permission" | "question";

const CENTER_TABS = [
  { value: "agent", label: "Agent" },
  { value: "sub", label: "Check drag between epic rows", isClosable: true },
  { value: "file", label: "BoardView.tsx", isClosable: true },
];

/** Per-route overrides, used by the chat-state gallery (ChatStatesScreen). */
export interface ChatOverrides {
  top?: ReactNode;
  box?: ReactNode;
  transcript?: ReactNode;
  panelTab?: PanelTab;
  listState?: ListState;
  /** Checkout bar state (open picker, create views, locked). */
  checkout?: Partial<CheckoutState>;
  /** Dialogs, toasts and the like, rendered over the screen. */
  overlay?: ReactNode;
}

export default function ChatScreen({
  variant = "working",
  isSidebarCollapsed,
  initialTab = "agent",
  overrides = {},
}: {
  variant?: ChatVariant;
  isSidebarCollapsed?: boolean;
  initialTab?: string;
  overrides?: ChatOverrides;
}) {
  const [centerTab, setCenterTab] = useState(initialTab);
  const panelTab: PanelTab =
    overrides.panelTab ?? (variant === "working" ? "files" : variant === "permission" ? "subagents" : "actions");
  const defaultBox =
    variant === "permission" ? (
      <PermissionPrompt />
    ) : variant === "question" ? (
      <ElicitationPrompt />
    ) : (
      <MessageComposer isWorking queued={["Also run the board tests once the edit lands"]} />
    );
  const box = overrides.box ?? defaultBox;
  const defaultTop =
    variant === "permission" ? (
      <VStack gap={2}>
        <RateLimitNotice />
        <TaskLinkNotice />
      </VStack>
    ) : undefined;
  const top = "top" in overrides ? overrides.top : defaultTop;

  return (
    <>
    <AppFrame
      selection={{ kind: "chat", id: "c42" }}
      isSidebarCollapsed={isSidebarCollapsed}
      titleBar={
        <TitleBar
          crumbs={[{ label: "ai-leash", href: "#/board" }, { label: "#42 Astryx: board on the kanban template" }]}
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
                      checkout={{ worktree: "task-42", branch: "task/42-astryx-board", ...overrides.checkout }}
                    />
                  }
                >
                  {overrides.transcript ?? <Transcript />}
                </ChatLayout>
              </LayoutContent>
            }
          />
        }
        panel={<SidePanel initialTab={panelTab} listState={overrides.listState} />}
      />
    </AppFrame>
    {overrides.overlay}
    </>
  );
}
