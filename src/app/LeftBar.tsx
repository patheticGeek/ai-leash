import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Folder,
  FolderPlus,
  GitBranch,
  Loader,
  MessageCircleQuestion,
  SettingsIcon,
  ShieldAlert,
  Trash2,
  Undo2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, revealOnGroupHover } from "@/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/ui/context-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { useGenerating } from "../lib/generatingQuery";
import type {
  ElicitationRequestPayload,
  PermissionRequestPayload,
} from "../lib/tauriApi";
import { useCurrentGitBranch } from "../lib/useCurrentGitBranch";
import {
  type ConversationSummary,
  elicitationForSession,
  permissionForSession,
  useAppStore,
} from "../store";

// Sentinel for "no project filter" — Radix `Select` doesn't allow an empty
// string item value (that's reserved to mean "no selection").
const ALL_PROJECTS = "all";

// Right-click menu shared by both conversation row kinds.
function ConversationContextMenu({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem variant="danger" onSelect={onDelete}>
          <Trash2 />
          Delete conversation
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ConversationRow({
  conversation,
  projectName,
  active,
  onClick,
  onDelete,
  onMarkDone,
}: {
  conversation: ConversationSummary;
  projectName: string;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  onMarkDone: () => void;
}) {
  const generating = useGenerating(conversation.id).active;
  const pendingPermissions = useAppStore((s) => s.pendingPermissions);
  const awaitingApproval = !!permissionForSession(
    pendingPermissions,
    conversation.id,
  );
  const pendingElicitations = useAppStore((s) => s.pendingElicitations);
  const awaitingAnswer = !!elicitationForSession(
    pendingElicitations,
    conversation.id,
  );
  const needsAttention = awaitingApproval || awaitingAnswer;

  // Live — same watcher-backed hook `CheckoutBar` uses, so a branch switch
  // made from there (or from outside the app entirely) shows up here too,
  // not just a one-time snapshot from when the row first rendered.
  const checkoutPath = conversation.worktreePath ?? conversation.projectRoot;
  const branchName = useCurrentGitBranch(checkoutPath);

  const projectAndWorkspace =
    projectName +
    " / " +
    (conversation.worktreePath
      ? (conversation.worktreePath.split(/[\\/]/).filter(Boolean).pop() ??
        conversation.worktreePath)
      : "primary");

  return (
    <ConversationContextMenu onDelete={onDelete}>
      <div
        className={cn(
          "group mx-1.5 mb-1.5 flex items-center rounded-md text-sm",
          active
            ? "bg-white/10 text-zinc-100"
            : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
          needsAttention
            ? "ring-1 ring-inset ring-amber-400/80 shadow-[0_0_10px_2px_rgba(251,191,36,0.45)]"
            : "",
        )}
      >
        <Button
          variant="unstyled"
          size="none"
          onClick={onClick}
          title={
            awaitingApproval
              ? `${projectName} — needs your approval`
              : awaitingAnswer
                ? `${projectName} — has a question for you`
                : projectName
          }
          className="flex min-w-0 flex-1 flex-col items-start text-left gap-0.5 px-3 py-2"
        >
          <span className="flex w-full items-center gap-1.5 mb-1.5 relative">
            <span className="min-w-0 flex-1 truncate text-zinc-200">
              {conversation.title || "New conversation"}
            </span>
            {awaitingApproval ? (
              <span
                title="Permission required"
                className="shrink-0 text-amber-400"
              >
                <ShieldAlert size={12} />
              </span>
            ) : awaitingAnswer ? (
              <span
                title="Waiting for your answer"
                className="shrink-0 text-amber-400"
              >
                <MessageCircleQuestion size={12} />
              </span>
            ) : (
              generating && (
                <span title="Working" className="shrink-0 text-blue-400">
                  <Loader size={12} className="animate-spin" />
                </span>
              )
            )}

            <Button
              variant="chip"
              size="sm"
              title="Mark as done"
              onClick={(event) => {
                event.stopPropagation();
                onMarkDone();
              }}
              // Overlays the title text, so it needs an opaque background
              // (chip's own is translucent).
              className={cn(
                "absolute right-0 z-10 -mr-2 bg-raised hover:bg-raised hover:text-emerald-400",
                revealOnGroupHover,
              )}
            >
              <Check size={12} />
              done
            </Button>
          </span>

          <span className="flex w-full items-center gap-1 text-xs text-zinc-500">
            <Folder className="size-2.5 shrink-0" />
            <span
              className="min-w-0 flex-1 truncate"
              title={projectAndWorkspace}
            >
              {projectAndWorkspace}
            </span>
            {branchName && (
              <>
                <GitBranch className="size-2.5 shrink-0" />
                <span className="max-w-28 shrink-0 truncate" title={branchName}>
                  {branchName}
                </span>
              </>
            )}
          </span>
        </Button>
      </div>
    </ConversationContextMenu>
  );
}

// Done conversations only show their title and a way back — see `LeftBar`'s
// collapsed "Done" section.
function DoneConversationRow({
  conversation,
  active,
  onClick,
  onDelete,
  onUndo,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  onUndo: () => void;
}) {
  return (
    <ConversationContextMenu onDelete={onDelete}>
      <div
        className={cn(
          "mx-1.5 flex items-stretch gap-2 rounded-md text-sm",
          active
            ? "bg-white/10 text-zinc-100"
            : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
        )}
      >
        <Button
          variant="unstyled"
          size="none"
          onClick={onClick}
          title={conversation.title || "New conversation"}
          className="min-w-0 flex-1 justify-start truncate text-left px-3 py-1.5"
        >
          {conversation.title || "New conversation"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Mark as not done"
          onClick={(event) => {
            event.stopPropagation();
            onUndo();
          }}
          className="shrink-0 text-zinc-500 hover:text-zinc-200 px-3"
        >
          <Undo2 size={14} />
        </Button>
      </div>
    </ConversationContextMenu>
  );
}

export default function LeftBar() {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const conversations = useAppStore((s) => s.conversations);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const openConversation = useAppStore((s) => s.openConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const setConversationDone = useAppStore((s) => s.setConversationDone);
  const addProject = useAppStore((s) => s.addProject);
  const setSettingsModalOpen = useAppStore((s) => s.setSettingsModalOpen);
  const addPendingPermission = useAppStore((s) => s.addPendingPermission);
  const resolvePendingPermission = useAppStore(
    (s) => s.resolvePendingPermission,
  );
  const addPendingElicitation = useAppStore((s) => s.addPendingElicitation);
  const resolvePendingElicitation = useAppStore(
    (s) => s.resolvePendingElicitation,
  );
  // Which project's conversations to show — `null` (the default) means "all
  // projects, all conversations," matching the flat list this sidebar
  // already showed before this filter existed.
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  // Collapsed by default — only the 3 most recently-done conversations show
  // until expanded, so a long "done" backlog doesn't push active
  // conversations out of view.
  const [doneExpanded, setDoneExpanded] = useState(false);
  const DEFAULT_VISIBLE_DONE = 3;

  async function onAddProject() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      await addProject(dir);
    }
  }

  // One global event carrying its own `sessionId` (see
  // `tools::request_permission`), same shape as `chat://generating` — so
  // this only needs one listener each, not one per known conversation.
  // Still lives here rather than e.g. `App.tsx` so it's colocated with the
  // other always-mounted, cross-conversation state this component already
  // owns.
  useEffect(() => {
    const unlistens = [
      listen<PermissionRequestPayload>("permission://request", (e) => {
        addPendingPermission(e.payload);
      }),
      listen<{ id: string }>("permission://resolved", (e) => {
        resolvePendingPermission(e.payload.id);
      }),
      listen<ElicitationRequestPayload>("elicitation://request", (e) => {
        addPendingElicitation(e.payload);
      }),
      listen<{ id: string }>("elicitation://resolved", (e) => {
        resolvePendingElicitation(e.payload.id);
      }),
    ];
    return () => {
      unlistens.forEach((u) => {
        u.then((f) => f());
      });
    };
  }, [
    addPendingPermission,
    resolvePendingPermission,
    addPendingElicitation,
    resolvePendingElicitation,
  ]);

  const filteredConversations = conversations.filter(
    (c) => !projectFilter || c.projectRoot === projectFilter,
  );
  const sortedConversations = filteredConversations
    .filter((c) => !c.done)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const doneConversations = filteredConversations
    .filter((c) => c.done)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const visibleDoneConversations = doneExpanded
    ? doneConversations
    : doneConversations.slice(0, DEFAULT_VISIBLE_DONE);

  return (
    <div className="relative flex h-full flex-col bg-sunken">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/5 px-1.5 h-12">
        <Select
          value={projectFilter ?? ALL_PROJECTS}
          onValueChange={(value) =>
            setProjectFilter(value === ALL_PROJECTS ? null : value)
          }
        >
          <SelectTrigger
            size="sm"
            className="h-auto! min-w-0 flex-1 border-none bg-transparent px-3 py-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          >
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent align="start" className="p-1">
            <SelectItem value={ALL_PROJECTS} className="px-3 py-2">
              All projects
            </SelectItem>
            {recentProjects.map((p) => (
              <SelectItem
                key={p.path}
                value={p.path}
                className="px-3 py-2 cursor-pointer"
              >
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon-lg"
          title="Add project"
          onClick={onAddProject}
          className="shrink-0 text-zinc-500 hover:text-zinc-200"
        >
          <FolderPlus size={17} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {sortedConversations.length === 0 && doneConversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-600">
            {projectFilter
              ? "No conversations for this project"
              : "No conversations yet"}
          </div>
        ) : (
          <>
            {sortedConversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                projectName={
                  recentProjects.find((p) => p.path === c.projectRoot)?.name ??
                  c.projectRoot
                }
                active={c.id === activeSessionId}
                onClick={() => openConversation(c.id)}
                onDelete={() => deleteConversation(c.id)}
                onMarkDone={() => setConversationDone(c.id, true)}
              />
            ))}
            {doneConversations.length > 0 && (
              <>
                <div className="mx-1.5 mt-3 my-1.5 px-3 text-xs font-medium text-zinc-600 flex items-center gap-2">
                  <span>Done</span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>
                {visibleDoneConversations.map((c) => (
                  <DoneConversationRow
                    key={c.id}
                    conversation={c}
                    active={c.id === activeSessionId}
                    onClick={() => openConversation(c.id)}
                    onDelete={() => deleteConversation(c.id)}
                    onUndo={() => setConversationDone(c.id, false)}
                  />
                ))}
                {doneConversations.length > DEFAULT_VISIBLE_DONE && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDoneExpanded((v) => !v)}
                    className="mx-1.5 mb-1.5 flex items-center justify-start bg-transparent text-xs text-zinc-500 hover:bg-transparent hover:text-zinc-300"
                  >
                    {doneExpanded
                      ? "Show less"
                      : `Show all (${doneConversations.length})`}
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </div>
      <div className="shrink-0 border-t border-white/[0.06] p-2">
        <Button
          variant="ghost"
          size="md"
          title="Settings"
          onClick={() => setSettingsModalOpen(true)}
          className="w-full justify-start gap-2 text-zinc-500 hover:text-zinc-200"
        >
          <SettingsIcon size={15} />
          Settings
        </Button>
      </div>
    </div>
  );
}
