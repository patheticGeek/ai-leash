import { open } from "@tauri-apps/plugin-dialog";
import { FolderPlus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { useAppStore } from "../store";

// The project switcher — lists known projects, and picking one starts a new
// conversation for it (`startNewConversation`). Used from the "new thread"
// empty state's "What are we working on in {project}?" heading
// (`ChatPanel.tsx`), where `{project}` is this popover's trigger — starting
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
              <div
                key={p.path}
                className="group flex items-center gap-1 hover:bg-white/5"
              >
                <Button
                  variant="unstyled"
                  size="none"
                  title={p.path}
                  onClick={() => {
                    startNewConversation(p.path);
                    setOpen(false);
                  }}
                  className="block min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-zinc-200"
                >
                  {p.name}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Forget this project"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeProject(p.path);
                  }}
                  className="mr-1 shrink-0 text-zinc-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-white/[0.06] p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-zinc-400 hover:text-zinc-200"
            onClick={onAddProject}
          >
            <FolderPlus size={14} />
            Add project
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
