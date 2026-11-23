import {
  ChatLayout,
  ChatMessage,
  ChatMessageList,
  ChatSystemMessage,
} from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { borderVars, colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { Bot, MessageSquare, X } from "lucide-react";
import {
  CheckoutBar,
  Composer,
  ElicitationPrompt,
  HandBackButton,
  PermissionPrompt,
  QueuedStrip,
  RateLimitActions,
  Strip,
} from "../chat/Composer";
import {
  ActivityGroup,
  AssistantFooter,
  AssistantText,
  Diff,
  NoteRow,
  SubAgentSpawn,
  SubAgentThread,
  SystemContextRow,
  ThinkingRow,
  ToolRow,
  UserMessage,
  WorkedFor,
  WorkingFor,
} from "../chat/Transcript";
import AppFrame from "../shell/AppFrame";
import SidePanel from "../shell/SidePanel";

const styles = stylex.create({
  fill: { height: "100%", minHeight: 0 },
  tabs: {
    flexShrink: 0,
    paddingBlock: spacingVars["--spacing-1"],
    borderBlockEndWidth: borderVars["--border-width"],
    borderBlockEndStyle: "solid",
    borderBlockEndColor: colorVars["--color-border"],
  },
  chat: { flex: 1, minHeight: 0 },
});

export type ChatVariant = "working" | "permission" | "question";

function CenterTabs({ withSubAgent }: { withSubAgent?: boolean }) {
  return (
    <HStack align="center" paddingInline={1} xstyle={styles.tabs}>
      <TabList value="agent" onChange={() => {}} size="sm">
        <Tab value="agent" label="Agent" icon={<Icon icon={MessageSquare} size="xsm" />} />
        {withSubAgent && (
          <Tab
            value="sub"
            label="Audit entry grouping"
            icon={<Icon icon={Bot} size="xsm" />}
            endContent={<Icon icon={X} size="xsm" color="secondary" />}
          />
        )}
      </TabList>
    </HStack>
  );
}

function WorkingTranscript() {
  return (
    <ChatMessageList density="compact" gap={4}>
      <SystemContextRow />
      <UserMessage from="Project chat" time="10:02">
        {`**#42 Astryx: board on the kanban template** · high · L · Astryx migration

Rebuild \`src/features/board\` on the kanban-board template. Keep group-by-epic, drag and drop, Show done and Load older. Move the task to Review when you're done.`}
      </UserMessage>
      <ChatMessage sender="assistant">
        <WorkedFor time="4m 51s" summary="3 thoughts, 14 tools used, 2 messages" />
        <AssistantText>{`The board now renders on the template's frame: a \`LayoutHeader\` toolbar, one muted \`Card\` per column with a status dot and count, and cards with number, priority and effort badges.

- **Group by epic** draws one swimlane per epic under a shared column header
- **Show done** adds the Done column, with **Load older** at its foot
- Drag still goes through dnd-kit; I kept \`BoardView\`'s sensors as they were`}</AssistantText>
        <AssistantFooter time="10:07" />
      </ChatMessage>
      <NoteRow from="#40 Terminal: honour code font size" first="Moved to Review — xterm now reads --al-code-size on every fit()." />
      <UserMessage time="10:11">
        {"Looks good. In group-by-epic, keep the epic name pinned left while scrolling sideways, and check that dragging a card into another epic's row changes its epic."}
      </UserMessage>
      <ChatMessage sender="assistant">
        <ThinkingRow seconds={6} text="The lane label has to stick inside the horizontal scroller, not the page…" />
        <ActivityGroup summary="1 thought, 3 tools used">
          <ToolRow name="read" target="src/features/board/BoardView.tsx" status="complete" duration="41ms" />
        </ActivityGroup>
        <SubAgentSpawn>
          <SubAgentThread description="Check drag between epic rows against dnd-kit" model="claude-sonnet-5-5" state="running" duration="1:04" lastStep="grep -rn onDragEnd src/features/board" />
          <SubAgentThread description="List every place that reads task.epic" model="claude-sonnet-5-5" state="done" duration="38s" lastStep="returned 6 call sites" />
        </SubAgentSpawn>
        <AssistantText>{"While those run I'll make the lane label sticky inside the scroller."}</AssistantText>
        <ToolRow
          name="edit"
          target="src/features/board/BoardView.tsx"
          status="running"
          additions={18}
          deletions={6}
          isExpanded
          resultDetail={
            <Diff
              code={`@@ -212,7 +212,12 @@ function EpicLane({ epic, columns }: LaneProps) {
-      <Text weight="semibold">{epic.name}</Text>
+      <HStack xstyle={styles.laneLabel}>
+        <Token color={epic.color} label={epic.name} />
+        <Text type="supporting" color="secondary">
+          {count} tasks
+        </Text>
+      </HStack>`}
            />
          }
        />
        <WorkingFor time="3:12" />
      </ChatMessage>
    </ChatMessageList>
  );
}

function PermissionTranscript() {
  return (
    <ChatMessageList density="compact" gap={4}>
      <SystemContextRow />
      <UserMessage time="09:40">{"Split Settings > Preferences into Chat, Fonts, External editor and Debug panels on the settings-dialog template."}</UserMessage>
      <ChatMessage sender="assistant">
        <WorkedFor time="6m 03s" summary="2 thoughts, 11 tools used, 1 message" />
        <AssistantText>{"Done — `PreferencesSettingsTab` is now four panels under a **Preferences** group in the settings nav. Each keeps its `SettingsCard` rows."}</AssistantText>
        <AssistantFooter time="09:46" />
      </ChatMessage>
      <UserMessage time="09:52">{"Run lint and the typecheck before I look."}</UserMessage>
      <ChatMessage sender="assistant">
        <ThinkingRow seconds={2} />
        <ToolRow name="shell" target="npm run lint:fix && npx tsc --noEmit" status="pending" />
      </ChatMessage>
      <ChatSystemMessage>Waiting for your approval</ChatSystemMessage>
    </ChatMessageList>
  );
}

function QuestionTranscript() {
  return (
    <ChatMessageList density="compact" gap={4}>
      <SystemContextRow />
      <UserMessage time="11:20">{"Why does the PTY resize lag when I drag the side panel divider? It stutters with three terminals open."}</UserMessage>
      <ChatMessage sender="assistant">
        <ActivityGroup summary="2 thoughts, 7 tools used">
          <ToolRow name="grep" target={'"resize" src-tauri/src/pty.rs'} status="complete" duration="22ms" />
        </ActivityGroup>
        <AssistantText>{`Every pixel of the drag fires \`ResizeObserver\` → \`fit()\` → \`pty_resize\`, so each terminal does an \`ioctl(TIOCSWINSZ)\` and a full reflow per frame. With three terminals that's ~180 resizes a second.

I can fix it in one of two places — see the question below.`}</AssistantText>
      </ChatMessage>
    </ChatMessageList>
  );
}

export default function ChatScreen({ variant }: { variant: ChatVariant }) {
  const chat =
    variant === "working"
      ? { id: "c42", title: "#42 Astryx: board on the kanban template" }
      : variant === "permission"
        ? { id: "c38", title: "#38 Split Preferences into Chat / Fonts / Debug" }
        : { id: "c2", title: "Why does the PTY resize lag on drag?" };
  const composer =
    variant === "working" ? (
      <VStack gap={0}>
        <QueuedStrip messages={["Also run the board tests once the edit lands"]} />
        <Composer agent="Claude Code · Opus 5.5" effort="High" mode="Accept edits" isSending contextPercent={62} />
        <CheckoutBar worktree="task-42" branch="task/42-astryx-board" isLocked />
      </VStack>
    ) : variant === "permission" ? (
      <VStack gap={0}>
        <Strip
          tone="warning"
          title="Claude session limit reached"
          description="Resets at 14:30. Resume automatically then?"
          end={<RateLimitActions />}
        />
        <Strip
          tone="info"
          title="The project chat isn't following #38"
          description="It only gets notes of what happens here."
          end={<HandBackButton />}
        />
        <PermissionPrompt />
        <CheckoutBar worktree="task-38" branch="task/38-settings-split" isLocked />
      </VStack>
    ) : (
      <VStack gap={0}>
        <ElicitationPrompt />
        <CheckoutBar worktree="primary" branch="astryx-migration" isLocked />
      </VStack>
    );
  return (
    <AppFrame
      project="ai-leash"
      title={chat.title}
      selectedChat={chat.id}
      end={
        <SidePanel
          tab={variant === "working" ? "files" : variant === "permission" ? "subagents" : "actions"}
          hasDrawer={variant === "question"}
        />
      }
    >
      <VStack xstyle={styles.fill}>
        <CenterTabs withSubAgent={variant === "working"} />
        <ChatLayout density="compact" composer={composer} xstyle={styles.chat}>
          {variant === "working" ? <WorkingTranscript /> : variant === "permission" ? <PermissionTranscript /> : <QuestionTranscript />}
        </ChatLayout>
      </VStack>
    </AppFrame>
  );
}
