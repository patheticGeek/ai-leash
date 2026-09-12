import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderPlus,
  Loader,
  SettingsIcon,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { type MouseEvent, useEffect, useState } from "react";
import { Button } from "@/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import type { PermissionRequestPayload } from "../lib/tauriApi";
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
}: {
  conversation: ConversationSummary;
  projectName: string;
  active: boolean;
  onClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
}) {
  const generating = useAppStore(
    (s) => !!s.generatingSessions[conversation.id],
  );
  const pendingPermissions = useAppStore((s) => s.pendingPermissions);
  const awaitingApproval = !!permissionForSession(
    pendingPermissions,
    conversation.id,
  );

  return (
    <Button
      variant="unstyled"
      size="none"
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={
        awaitingApproval ? `${projectName} — needs your approval` : projectName
      }
      className={`mx-1.5 mb-0.5 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left cursor-default ${
        active
          ? "bg-white/10 text-zinc-100"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
      } ${
        awaitingApproval
          ? "ring-1 ring-inset ring-amber-400/80 shadow-[0_0_10px_2px_rgba(251,191,36,0.45)]"
          : ""
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="min-w-0 truncate text-zinc-200">
          {conversation.title || "New conversation"}
        </span>
        <span className="block truncate text-[11px] text-zinc-500">
          {projectName}
        </span>
      </span>
      {awaitingApproval ? (
        <span title="Permission required" className="shrink-0 text-amber-400">
          <ShieldAlert size={14} />
        </span>
      ) : (
        generating && (
          <span title="Working" className="shrink-0 text-blue-400">
            <Loader size={14} className="animate-spin" />
          </span>
        )
      )}
    </Button>
  );
}

export default function LeftBar() {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const conversations = useAppStore((s) => s.conversations);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const openConversation = useAppStore((s) => s.openConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const addProject = useAppStore((s) => s.addProject);
  const setSettingsModalOpen = useAppStore((s) => s.setSettingsModalOpen);
  const setSessionGenerating = useAppStore((s) => s.setSessionGenerating);
  const touchConversationActivity = useAppStore(
    (s) => s.touchConversationActivity,
  );
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
  useEffect(() => {
    const unlistens = conversations.map((c) =>
      listen<{ active: boolean; autonomous: boolean }>(
        `chat://${c.id}/generating`,
        (e) => {
          setSessionGenerating(c.id, e.payload.active, e.payload.autonomous);
          if (e.payload.active) touchConversationActivity(c.id);
        },
      ),
    );
    return () => {
      unlistens.forEach((u) => {
        u.then((f) => f());
      });
    };
  }, [conversations, setSessionGenerating, touchConversationActivity]);

  const sortedConversations = [...conversations]
    .filter((c) => !projectFilter || c.projectRoot === projectFilter)
    .sort((a, b) => b.updatedAt - a.updatedAt);

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
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {sortedConversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-600">
            {projectFilter
              ? "No conversations for this project"
              : "No conversations yet"}
          </div>
        ) : (
          sortedConversations.map((c) => (
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
            />
          ))
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
