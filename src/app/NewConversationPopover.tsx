import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { useContainerReveal } from "@astryxdesign/core/hooks";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import { Popover } from "@astryxdesign/core/Popover";
import { ScrollableArea } from "@astryxdesign/core/ScrollableArea";
import { HStack, Stack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import * as stylex from "@stylexjs/stylex";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderPlus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { type RecentProject, useAppStore } from "../store";

const styles = stylex.create({
  // Long project lists scroll inside the popover.
  list: { maxHeight: "18rem" },
});

// One project row; its "forget" button shows on hover/focus.
function ProjectRow({
  project,
  onPick,
  onForget,
}: {
  project: RecentProject;
  onPick: () => void;
  onForget: () => void;
}) {
  const { getContainerProps, getContentRevealProps } = useContainerReveal();
  return (
    <Tooltip
      content={project.path}
      placement="end"
      delay={600}
      hasHoverIndication={false}
    >
      <Stack {...getContainerProps()}>
        <Item
          density="compact"
          onClick={onPick}
          label={project.name}
          endContent={
            <HStack as="span" {...getContentRevealProps()}>
              <IconButton
                variant="ghost"
                size="sm"
                label="Forget this project"
                tooltip="Forget this project"
                icon={<Trash2 size={12} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onForget();
                }}
              />
            </HStack>
          }
        />
      </Stack>
    </Tooltip>
  );
}

// The project switcher — lists known projects, and picking one starts a new
// conversation for it (`startNewConversation`). Used from the "new thread"
// empty state's "What are we working on in {project}?" heading
// (`NewThreadHero.tsx`), where `{project}` is this popover's trigger — starting
// a *fresh* project (rather than "current project") lives on the title
// bar's plain "New Thread" button instead, which doesn't need a picker.
// "Add project" (the footer button) is the native-folder-picker flow, also
// duplicated as `LeftBar.tsx`'s "Add project" item.
// Each row's trash icon is "forget this project folder" (`removeProject`)
// — the project-level counterpart to `LeftBar.tsx`'s per-conversation
// "Delete conversation", since that menu only ever targets one
// conversation, not a whole project.
export default function NewConversationPopover({
  trigger,
}: {
  trigger: ReactNode;
}) {
  const [open_, setOpen] = useState(false);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const startNewConversation = useAppStore((s) => s.startNewConversation);
  const addProject = useAppStore((s) => s.addProject);
  const removeProject = useAppStore((s) => s.removeProject);

  async function onAddProject() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      await addProject(dir);
    }
    setOpen(false);
  }

  return (
    <Popover
      isOpen={open_}
      onOpenChange={setOpen}
      label="Projects"
      placement="below"
      alignment="center"
      width="16rem"
      padding={0}
      content={
        <VStack>
          <ScrollableArea label="Projects" padding={1} xstyle={styles.list}>
            {recentProjects.length === 0 ? (
              <Text type="supporting" color="secondary">
                No projects yet
              </Text>
            ) : (
              recentProjects.map((p) => (
                <ProjectRow
                  key={p.path}
                  project={p}
                  onPick={() => {
                    startNewConversation(p.path);
                    setOpen(false);
                  }}
                  onForget={() => removeProject(p.path)}
                />
              ))
            )}
          </ScrollableArea>
          <Divider />
          <VStack padding={1}>
            <Button
              variant="ghost"
              size="sm"
              label="Add project"
              icon={<FolderPlus size={14} />}
              width="100%"
              onClick={onAddProject}
            />
          </VStack>
        </VStack>
      }
    >
      {trigger}
    </Popover>
  );
}
