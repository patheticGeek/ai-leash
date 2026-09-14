import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Folder,
  FolderPlus,
  GitBranch,
  Loader,
  SettingsIcon,
  ShieldAlert,
  Trash2,
  Undo2,
} from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import {
  ensureGeneratingListener,
  forgetGeneratingListener,
} from "../lib/generatingListener";
import type { PermissionRequestPayload } from "../lib/tauriApi";
import { useCurrentGitBranch } from "../lib/useCurrentGitBranch";
import {
  type ConversationSummary,
  permissionForSession,
  useAppStore,
} from "../store";

// Sentinel for "no project filter" — Radix `Select` doesn't allow an empty
// string item value (that's reserved to mean "no selection").
const ALL_PROJECTS = "all";

function ConversationRow({
  conversation,
  projectName,
  active,
  onClick,
  onContextMenu,
  onMarkDone,
}: {
  conversation: ConversationSummary;
  projectName: string;
  active: boolean;
  onClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
  onMarkDone: () => void;
}) {
  const generating = useAppStore(
    (s) => !!s.generatingSessions[conversation.id],
  );
  const pendingPermissions = useAppStore((s) => s.pendingPermissions);
  const awaitingApproval = !!permissionForSession(
    pendingPermissions,
    conversation.id,
  );

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
    <div
      className={`group mx-1.5 mb-1.5 flex w-[calc(100%-0.75rem)] items-center rounded-md px-3 py-2 text-sm ${
        active
          ? "bg-white/10 text-zinc-100"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
      } ${
        awaitingApproval
          ? "ring-1 ring-inset ring-amber-400/80 shadow-[0_0_10px_2px_rgba(251,191,36,0.45)]"
          : ""
      }`}
    >
      <Button
        variant="unstyled"
        size="none"
        onClick={onClick}
        onContextMenu={onContextMenu}
        title={
          awaitingApproval
            ? `${projectName} — needs your approval`
            : projectName
        }
        className="flex min-w-0 flex-1 flex-col items-start text-left gap-2"
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
          ) : (
            generating && (
              <span title="Working" className="shrink-0 text-blue-400">
                <Loader size={12} className="animate-spin" />
              </span>
            )
          )}

          <Button
            variant="ghost"
            size="sm"
            title="Mark as done"
            onClick={(event) => {
              event.stopPropagation();
              onMarkDone();
            }}
            className="absolute right-0 z-10 gap-1 -mr-2 px-1.5 text-xs bg-white/5 text-zinc-500 opacity-0 hover:text-emerald-400 group-hover:opacity-100"
          >
            <Check size={12} />
            done
          </Button>
        </span>

        <span className="flex w-full items-center gap-1 text-xs text-zinc-500">
          <Folder className="size-2.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={projectAndWorkspace}>
            {projectAndWorkspace}
          </span>
          {branchName && (
            <>
              <GitBranch className="size-2.5 shrink-0" />
              <span className="max-w-24 shrink-0 truncate" title={branchName}>
                {branchName}
              </span>
            </>
          )}
        </span>
      </Button>
    </div>
  );
}

// Done conversations only show their title and a way back — see `LeftBar`'s
// collapsed "Done" section.
function DoneConversationRow({
  conversation,
  active,
  onClick,
  onContextMenu,
  onUndo,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
  onUndo: () => void;
}) {
  return (
    <div
      className={`mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded-md text-sm ${
        active
          ? "bg-white/10 text-zinc-100"
          : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
      }`}
    >
      <Button
        variant="unstyled"
        size="none"
        onClick={onClick}
        onContextMenu={onContextMenu}
        title={conversation.title || "New conversation"}
        className="min-w-0 flex-1 justify-start truncate text-left px-3 py-2"
      >
        {conversation.title || "New conversation"}
      </Button>
      <Button
        variant="ghost"
        title="Mark as not done"
        onClick={(event) => {
          event.stopPropagation();
          onUndo();
        }}
        className="shrink-0 text-zinc-500 hover:text-zinc-200 py-4 px-3"
      >
        <Undo2 size={14} />
      </Button>
    </div>
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
  const [contextMenu, setContextMenu] = useState<{
    conversation: ConversationSummary;
    x: number;
    y: number;
  } | null>(null);
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

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  // Unlike `chat://{sessionId}/generating`, `permission://request` isn't
  // path-templated per conversation — it's one global event carrying its
  // own `sessionId` (see `tools::request_permission`) — so this only needs
  // one listener each, not one per known conversation. Still lives here
  // rather than e.g. `App.tsx` so it's colocated with the other
  // always-mounted, cross-conversation state this component already owns.
  useEffect(() => {
    const unlistens = [
      listen<PermissionRequestPayload>("permission://request", (e) => {
        addPendingPermission(e.payload);
      }),
      listen<{ id: string }>("permission://resolved", (e) => {
        resolvePendingPermission(e.payload.id);
      }),
    ];
    return () => {
      unlistens.forEach((u) => {
        u.then((f) => f());
      });
    };
  }, [addPendingPermission, resolvePendingPermission]);

  // Always mounted regardless of which conversation (if any) is currently
  // open, so a turn's `generating` state is tracked even while you're
  // looking at a different conversation entirely — see
  // `run_with_cancellation` in chat.rs, the single place this event is
  // emitted from. One listener per conversation id (not per project) since
  // multiple conversations for the same project can now generate
  // independently. A turn starting is also what bumps the conversation's
  // sort order (`touchConversationActivity`), not merely opening/switching
  // to it — otherwise clicking around the sidebar to look at things would
  // keep reshuffling it.
  //
  // Diffed against a persistent ref rather than keyed directly off
  // `conversations` in the dependency array: that array gets a new
  // reference on every title/activity update, not just when a conversation
  // is actually added or removed. Tearing down and rebuilding every
  // listener on each of those unrelated mutations reopens a real race — a
  // brand new conversation's first turn fires `markConversationStarted`
  // (adds the row) immediately followed by this same listener's own
  // `touchConversationActivity` call on `active: true`, both of which used
  // to retrigger this effect right as the turn starts. `listen()` is async,
  // so if the backend's `active: false` lands while the old listener has
  // been torn down but the new one hasn't finished registering yet, it's
  // lost for good — `generatingSessions` never flips back off and the
  // "Working for" timer runs forever until the user manually stops.
  // Registration itself lives in `generatingListener.ts`, shared with
  // `ChatPanel.submitPrompt` so a brand-new conversation's first turn can
  // await it before invoking the backend — see that module for why. This
  // ref just tracks which ids *this component* has already asked for, so
  // it knows which to release when a conversation disappears.
  const trackedGeneratingIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(conversations.map((c) => c.id));
    const tracked = trackedGeneratingIdsRef.current;
    for (const id of tracked) {
      if (!ids.has(id)) {
        forgetGeneratingListener(id);
        tracked.delete(id);
      }
    }
    for (const id of ids) {
      if (tracked.has(id)) continue;
      tracked.add(id);
      ensureGeneratingListener(id);
    }
  }, [conversations]);
  // Only tears every listener down on unmount — LeftBar stays mounted for
  // the app's whole lifetime, so in practice this is dead code, but it's
  // the honest cleanup counterpart to the ref above.
  useEffect(() => {
    const tracked = trackedGeneratingIdsRef.current;
    return () => {
      for (const id of tracked) {
        forgetGeneratingListener(id);
      }
      tracked.clear();
    };
  }, []);

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
    <div className="relative flex h-full flex-col bg-[#0b0c0e] shadow-[var(--al-shadow-r)]">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] p-1.5">
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
              <SelectItem key={p.path} value={p.path} className="px-3 py-2">
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
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setContextMenu({
                    conversation: c,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
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
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenu({
                        conversation: c,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                    onUndo={() => setConversationDone(c.id, false)}
                  />
                ))}
                {doneConversations.length > DEFAULT_VISIBLE_DONE && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDoneExpanded((v) => !v)}
                    className="mx-1.5 mb-1.5 flex w-[calc(100%-0.75rem)] items-center justify-start bg-transparent text-xs text-zinc-500 hover:bg-transparent hover:text-zinc-300"
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
          size="default"
          title="Settings"
          onClick={() => setSettingsModalOpen(true)}
          className="w-full justify-start gap-2 text-zinc-500 hover:text-zinc-200"
        >
          <SettingsIcon size={15} />
          Settings
        </Button>
      </div>
      {contextMenu && (
        <div
          className="fixed z-50 min-w-36 rounded-md bg-[#17181c] p-1 shadow-[var(--al-shadow)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Button
            variant="danger"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => {
              deleteConversation(contextMenu.conversation.id);
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} />
            Delete conversation
          </Button>
        </div>
      )}
    </div>
  );
}
