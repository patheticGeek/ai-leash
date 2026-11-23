import { Badge } from "@astryxdesign/core/Badge";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { useContainerReveal } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Kbd } from "@astryxdesign/core/Kbd";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Selector } from "@astryxdesign/core/Selector";
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Stack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import {
  Archive,
  FolderGit2,
  FolderPlus,
  KanbanSquare,
  ListFilter,
  Settings,
  SquarePen,
} from "lucide-react";
import { useState } from "react";
import { BOARDS, CHATS, type ChatRow, DONE_CHATS, PROJECTS } from "../data";

const styles = stylex.create({
  section: { paddingBlock: spacingVars["--spacing-1"] },
  header: { paddingInlineEnd: spacingVars["--spacing-1"] },
  // A collapsible SideNavItem lays its children out in a grid whose item
  // takes the rows' min-content width, so long titles push the end slots
  // (status, counts) out of the rail. Containing the inline size lets the
  // labels ellipsize instead.
  nested: { containIntrinsicInlineSize: "auto 0px", contain: "inline-size" },
});

function ChatStatusEnd({ chat }: { chat: ChatRow }) {
  if (chat.status === "working") {
    return (
      <HStack align="center" gap={1}>
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {chat.elapsed}
        </Text>
        <Spinner size="sm" aria-label="Working" />
      </HStack>
    );
  }
  if (chat.status === "approval") {
    return (
      <StatusDot variant="warning" isPulsing label="Needs approval" tooltip="Needs approval" />
    );
  }
  if (chat.status === "question") {
    return (
      <StatusDot variant="warning" label="Waiting for your answer" tooltip="Waiting for your answer" />
    );
  }
  return null;
}

function ChatItem({ chat, isSelected }: { chat: ChatRow; isSelected: boolean }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { getContainerProps, getContentRevealProps } = useContainerReveal();
  return (
    <Stack {...getContainerProps({ forceState: isMenuOpen ? "active" : undefined })}>
      <SideNavItem
        label={chat.task != null ? `#${chat.task}  ${chat.title}` : chat.title}
        isSelected={isSelected}
        size="sm"
        onClick={() => {}}
        endContent={<ChatStatusEnd chat={chat} />}
        actions={
          <Stack {...getContentRevealProps()}>
            <MoreMenu
              size="sm"
              label="Conversation actions"
              onOpenChange={setIsMenuOpen}
              items={[
                { label: "Mark as done", onClick: () => {} },
                { label: "Open in new tab", onClick: () => {} },
                { type: "divider" },
                { label: "Delete conversation", variant: "destructive", onClick: () => {} },
              ]}
            />
          </Stack>
        }
      />
    </Stack>
  );
}

/**
 * The LeftBar on the side-nav template: one collapsible group per project
 * (its board first, then its chats), Done folded at the bottom, Settings in
 * the footer.
 */
export default function LeftBar({
  selectedChat,
  selectedBoard,
}: {
  selectedChat?: string;
  selectedBoard?: string;
}) {
  return (
    <SideNav
      aria-label="Conversations"
      resizable={{ defaultWidth: 248, minWidth: 200, maxWidth: 420 }}
      header={
        <HStack align="center" gap={0.5} xstyle={styles.header}>
          <Selector
            label="Project"
            isLabelHidden
            variant="ghost"
            size="sm"
            width="100%"
            value="all"
            onChange={() => {}}
            options={[
              { value: "all", label: "All projects" },
              ...PROJECTS.map((p) => ({ value: p, label: p })),
            ]}
          />
          <IconButton variant="ghost" size="sm" label="Task chats" tooltip="Task chats: show all" icon={<Icon icon={ListFilter} size="sm" />} />
          <IconButton variant="ghost" size="sm" label="Add project" tooltip="Add project" icon={<Icon icon={FolderPlus} size="sm" />} />
        </HStack>
      }
      topContent={
        <SideNavItem
          label="New thread"
          icon={<Icon icon={SquarePen} size="sm" />}
          onClick={() => {}}
          endContent={<Kbd keys="mod+n" />}
        />
      }
      footer={
        <SideNavSection title="App" isHeaderHidden>
          <SideNavItem label="Settings" icon={<Icon icon={Settings} size="sm" />} onClick={() => {}} />
        </SideNavSection>
      }
    >
      <VStack gap={1}>
        {PROJECTS.map((project) => {
          const board = BOARDS.find((b) => b.project === project);
          const chats = CHATS.filter((c) => c.project === project);
          return (
            <SideNavSection key={project} title={project} isHeaderHidden xstyle={styles.section}>
              <SideNavItem
                label={project}
                icon={<Icon icon={FolderGit2} size="sm" />}
                collapsible={{ defaultIsCollapsed: project === "dotfiles" }}
              >
                <VStack gap={0.5} xstyle={styles.nested}>
                  <SideNavItem
                    label="Board"
                    size="sm"
                    icon={<Icon icon={KanbanSquare} size="sm" />}
                    isSelected={selectedBoard === project}
                    onClick={() => {}}
                    endContent={
                      board && (board.inProgress > 0 || board.review > 0) ? (
                        <HStack gap={0.5} align="center">
                          {board.isWorking && <Spinner size="sm" aria-label="Working" />}
                          {board.inProgress > 0 && (
                            <Badge variant="info" label={board.inProgress} />
                          )}
                          {board.review > 0 && (
                            <Badge variant="warning" label={board.review} />
                          )}
                        </HStack>
                      ) : undefined
                    }
                  />
                  {chats.map((chat) => (
                    <ChatItem key={chat.id} chat={chat} isSelected={chat.id === selectedChat} />
                  ))}
                </VStack>
              </SideNavItem>
            </SideNavSection>
          );
        })}
        <Divider />
        <SideNavSection title="Done" isHeaderHidden xstyle={styles.section}>
          <SideNavItem
            label="Done"
            icon={<Icon icon={Archive} size="sm" />}
            endContent={<Text type="supporting" color="secondary">{DONE_CHATS.length}</Text>}
            collapsible={{ defaultIsCollapsed: true }}
          >
            <VStack gap={0.5} xstyle={styles.nested}>
              {DONE_CHATS.map((t) => (
                <SideNavItem key={t} label={t} size="sm" onClick={() => {}} />
              ))}
            </VStack>
          </SideNavItem>
        </SideNavSection>
      </VStack>
    </SideNav>
  );
}
