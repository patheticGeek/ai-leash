import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderPlus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { revealOnGroupHover } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { useAppStore } from "../store";

// The project switcher — lists known projects, and picking one starts a new
// conversation for it (`startNewConversation`). Used from the "new thread"
// empty state's "What are we working on in {project}?" heading
// (`NewThreadHero.tsx`), where `{project}` is this popover's trigger — starting
// a *fresh* project (rather than "current project") lives on the title
// bar's plain "New Thread" button instead, which doesn't need a picker.
// "Add project" (the footer button) is the native-folder-picker flow, also
// duplicated as the folder+ icon in `LeftBar.tsx`'s project filter row.
// Each row's trash icon is "forget this project folder" (`removeProject`)
// — the project-level counterpart to `LeftBar.tsx`'s per-conversation
// "Delete conversation", since that context menu only ever targets one
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
    <Popover open={open_} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={8}
        className="w-64 gap-0 overflow-hidden p-0"
      >
        <div className="max-h-72 overflow-y-auto py-1">
          {recentProjects.length === 0 ? (
            <div className="px-3 py-4 text-xs text-zinc-600">
              No projects yet
            </div>
          ) : (
            recentProjects.map((p) => (
              <div key={p.path} title={p.path} className="group mx-1">
                <Item
                  density="compact"
                  onClick={() => {
                    startNewConversation(p.path);
                    setOpen(false);
                  }}
                  label={p.name}
                  className="text-sm"
                  endContent={
                    <IconButton
                      variant="danger"
                      size="sm"
                      label="Forget this project"
                      tooltip="Forget this project"
                      icon={<Trash2 size={12} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeProject(p.path);
                      }}
                      className={revealOnGroupHover}
                    />
                  }
                />
              </div>
            ))
          )}
        </div>
        <div className="border-t border-white/[0.06] p-1">
          <Button
            variant="ghost"
            size="sm"
            label="Add project"
            icon={<FolderPlus size={14} />}
            width="100%"
            className="justify-start"
            onClick={onAddProject}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
