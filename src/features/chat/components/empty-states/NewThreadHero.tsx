import { Icon } from "@astryxdesign/core/Icon";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Folder, FolderPlus, Sparkles } from "lucide-react";
import { pickAndAddProject } from "@/app/projectActions";
import { useAppStore } from "@/store";

const ADD_PROJECT = "\0add-project";

// The heading's project name is a picker: a ghost, label-less Selector
// inline in the heading (recent projects with their paths, then "Add
// project…"). Picking a project starts a fresh draft there
// (`startNewConversation`), which re-targets the checkout bar under the
// composer and the "starts with" row; "Add project…" is the native folder
// picker (`pickAndAddProject`), which starts one in the new project.
function ProjectPicker({ projectRoot }: { projectRoot: string }) {
  const recentProjects = useAppStore((s) => s.recentProjects);
  const startNewConversation = useAppStore((s) => s.startNewConversation);
  // The open project may not be in the recent list (yet); still show it.
  const projects = recentProjects.some((p) => p.path === projectRoot)
    ? recentProjects
    : [
        {
          path: projectRoot,
          name: projectRoot.split(/[\\/]/).pop() || projectRoot,
        },
        ...recentProjects,
      ];
  return (
    <Selector
      label="Project"
      isLabelHidden
      variant="ghost"
      size="lg"
      value={projectRoot}
      onChange={(v) => {
        if (v === ADD_PROJECT) void pickAndAddProject();
        else if (v && v !== projectRoot) void startNewConversation(v);
      }}
      options={[
        {
          type: "section",
          title: "Recent projects",
          options: projects.map((p) => ({
            value: p.path,
            label: p.name,
            description: p.path,
            icon: Folder,
          })),
        },
        { type: "divider" },
        { value: ADD_PROJECT, label: "Add project…", icon: FolderPlus },
      ]}
      renderValue={(o) => (
        <Text type="large" as="span">
          {o.label}
        </Text>
      )}
    />
  );
}

// The `ai-chat-landing` template's greeting + display headline, above the
// composer on the "new thread" screen (a conversation with no message sent
// yet). `ChatPanel` lays out the column.
export default function NewThreadHero({
  projectRoot,
}: {
  projectRoot: string;
}) {
  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center">
        <Icon icon={Sparkles} size="md" color="accent" />
        <Text type="large" as="h2">
          New thread in
        </Text>
        <ProjectPicker projectRoot={projectRoot} />
      </HStack>
      <Text type="display-2" as="h1">
        What should the agent work on?
      </Text>
    </VStack>
  );
}
