// Left bar — the shell-side-nav template's SideNav: a heading, a hidden-header
// menu section, one collapsible item per project holding its board and chats,
// a Done group, and Settings in the footer. Row structure (StatusDot end
// content, MoreMenu revealed by useContainerReveal) is copied from the
// template's ConversationItem.
import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Divider } from "@astryxdesign/core/Divider";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { Kbd } from "@astryxdesign/core/Kbd";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import {
  SideNav,
  SideNavCollapseButton,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { HStack, Stack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { useContainerReveal } from "@astryxdesign/core/hooks";
import {
  ArchiveBoxIcon,
  Cog6ToothIcon,
  FolderIcon,
  FolderPlusIcon,
  FunnelIcon,
  PencilSquareIcon,
  ViewColumnsIcon,
} from "../icons-lucide";
import appIcon from "../assets/app-icon.svg";
import { useSidebarCollapse } from "./sidebarCollapse";
import { BOARDS, CHATS, DONE_CHATS, PROJECTS, type ChatRow } from "../data";

const styles = stylex.create({
  // A collapsible SideNavItem lays its children out in a grid that takes the
  // rows' min-content width, so long titles push the end slots out of the
  // rail. Containing the inline size keeps the rows inside it.
  nested: { contain: "inline-size" },
});

export type LeftBarSelection = { kind: "chat"; id: string } | { kind: "board"; project: string } | { kind: "new" } | { kind: "none" };

function ChatStatus({ chat }: { chat: ChatRow }) {
  if (chat.status === "working") {
    return (
      <HStack gap={1.5} vAlign="center">
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {chat.elapsed}
        </Text>
        <StatusDot variant="accent" isPulsing label="Working" tooltip="The agent is working" />
      </HStack>
    );
  }
  if (chat.status === "approval") {
    return <StatusDot variant="warning" isPulsing label="Needs approval" tooltip="Waiting for you to approve an action" />;
  }
  if (chat.status === "question") {
    return <StatusDot variant="warning" label="Has a question" tooltip="Waiting for your answer" />;
  }
  return null;
}

function ConversationItem({ chat, isSelected }: { chat: ChatRow; isSelected: boolean }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { getContainerProps, getContentRevealProps } = useContainerReveal();
  const label = chat.task ? `#${chat.task} ${chat.title}` : chat.title;
  return (
    <Stack {...getContainerProps({ forceState: isMenuOpen ? "active" : undefined })}>
      <SideNavItem
        label={label}
        href="#/chat"
        isSelected={isSelected}
        endContent={<ChatStatus chat={chat} />}
        actions={
          <HStack as="span" {...getContentRevealProps()}>
            <MoreMenu
              size="sm"
              label="Conversation options"
              onOpenChange={setIsMenuOpen}
              items={[
                { label: "Mark as done" },
                { label: "Open in new tab" },
                { type: "divider" },
                { label: "Delete conversation", variant: "destructive" },
              ]}
            />
          </HStack>
        }
      />
    </Stack>
  );
}

export default function LeftBar({ selection }: { selection: LeftBarSelection }) {
  const collapse = useSidebarCollapse();
  return (
    <SideNav
      collapsible={collapse}
      resizable={{ defaultWidth: 272, minWidth: 220, maxWidth: 420 }}
      header={
        <SideNavHeading
          heading="ai leash"
          headingHref="#/new"
          icon={<Avatar src={appIcon} name="ai leash" size="sm" shape="rounded" tooltip={false} />}
          headerEndContent={<SideNavCollapseButton size="sm" label="Collapse sidebar" />}
        />
      }
      footer={
        <SideNavSection title="App" isHeaderHidden>
          <SideNavItem label="Settings" icon={Cog6ToothIcon} href="#/settings/agents" />
        </SideNavSection>
      }
    >
      <SideNavSection title="Menu" isHeaderHidden>
        <SideNavItem
          label="New thread"
          icon={PencilSquareIcon}
          href="#/new"
          isSelected={selection.kind === "new"}
          endContent={<Kbd keys="ctrl+n" />}
        />
        <SideNavItem label="Add project" icon={FolderPlusIcon} href="#" />
      </SideNavSection>
      <Divider />
      <SideNavSection
        title="Projects"
        endContent={
          <DropdownMenu
            button={{
              label: "Filter the sidebar",
              variant: "ghost",
              size: "sm",
              icon: <Icon icon={FunnelIcon} size="sm" />,
              isIconOnly: true,
            }}
            hasChevron={false}
            items={[
              {
                type: "section",
                title: "Projects",
                items: [{ label: "All projects" }, ...PROJECTS.map((p) => ({ label: p }))],
              },
              { type: "divider" },
              {
                type: "section",
                title: "Task chats",
                items: [{ label: "Mixed in" }, { label: "Grouped at the top" }, { label: "Hidden" }],
              },
            ]}
          />
        }
      >
        {PROJECTS.map((project) => {
          const board = BOARDS.find((b) => b.project === project);
          const chats = CHATS.filter((c) => c.project === project);
          return (
            <SideNavItem
              key={project}
              label={project}
              icon={FolderIcon}
              collapsible={{ defaultIsCollapsed: project === "dotfiles" }}
            >
              <VStack gap={0.5} xstyle={styles.nested}>
                {board && (
                  <SideNavItem
                    label="Board"
                    icon={ViewColumnsIcon}
                    href="#/board"
                    isSelected={selection.kind === "board" && selection.project === project}
                    endContent={
                      board.review > 0 ? (
                        <Badge label={board.review} variant="warning" />
                      ) : undefined
                    }
                  />
                )}
                {chats.map((chat) => (
                  <ConversationItem
                    key={chat.id}
                    chat={chat}
                    isSelected={selection.kind === "chat" && selection.id === chat.id}
                  />
                ))}
              </VStack>
            </SideNavItem>
          );
        })}
      </SideNavSection>
      <Divider />
      <SideNavSection title="Done" isHeaderHidden>
        <SideNavItem
          label="Done"
          icon={ArchiveBoxIcon}
          collapsible={{ defaultIsCollapsed: true }}
          endContent={
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {DONE_CHATS.length}
            </Text>
          }
        >
          <VStack gap={0.5} xstyle={styles.nested}>
            {DONE_CHATS.map((title) => (
              <SideNavItem key={title} label={title} href="#/chat" />
            ))}
          </VStack>
        </SideNavItem>
      </SideNavSection>
    </SideNav>
  );
}
