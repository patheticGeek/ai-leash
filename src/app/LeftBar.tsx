import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import type { PermissionRequestPayload } from "../lib/tauriApi";
import {
  permissionForSession,
  type RecentProject,
  useAppStore,
} from "../store";
import Button from "../ui/Button";

function ProjectRow({
  project,
  active,
  onClick,
}: {
  project: RecentProject;
  active: boolean;
  onClick: () => void;
}) {
  const generating = useAppStore((s) => !!s.generatingSessions[project.path]);
  const pendingPermissions = useAppStore((s) => s.pendingPermissions);
  const awaitingApproval = !!permissionForSession(
    pendingPermissions,
    project.path,
  );

  return (
    <Button
      variant="unstyled"
      size="none"
      onClick={onClick}
      title={
        awaitingApproval
          ? `${project.path} — needs your approval`
          : project.path
      }
      className={`mx-1.5 mb-0.5 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left cursor-default ${
        active
          ? "bg-white/10 text-zinc-100"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
      } ${
        awaitingApproval
          ? "animate-pulse ring-1 ring-inset ring-amber-400/80 shadow-[0_0_10px_2px_rgba(251,191,36,0.45)]"
          : ""
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {generating && (
        <span
          title="Generating…"
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500"
        />
      )}
    </Button>
  );
}

export default function LeftBar() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const openProject = useAppStore((s) => s.openProject);
  const setSessionGenerating = useAppStore((s) => s.setSessionGenerating);
  const touchProjectActivity = useAppStore((s) => s.touchProjectActivity);
  const addPendingPermission = useAppStore((s) => s.addPendingPermission);
  const resolvePendingPermission = useAppStore(
    (s) => s.resolvePendingPermission,
  );

  // Unlike `chat://{sessionId}/generating`, `permission://request` isn't
  // path-templated per project — it's one global event carrying its own
  // `sessionId` (see `tools::request_permission`) — so this only needs one
  // listener each, not one per known project. Still lives here rather than
  // e.g. `App.tsx` so it's colocated with the other always-mounted,
  // cross-project state this component already owns.
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

  // Always mounted regardless of which project (if any) is currently open,
  // so a session's `generating` state is tracked even while you're looking
  // at a different project entirely — see `run_with_cancellation` in
  // chat.rs, the single place this event is emitted from. A turn starting
  // is also what bumps the project's sort order (`touchProjectActivity`),
  // not merely opening/switching to it — otherwise clicking around the
  // sidebar to look at things would keep reshuffling it.
  useEffect(() => {
    const unlistens = recentProjects.map((p) =>
      listen<{ active: boolean; autonomous: boolean }>(
        `chat://${p.path}/generating`,
        (e) => {
          setSessionGenerating(p.path, e.payload.active, e.payload.autonomous);
          if (e.payload.active) touchProjectActivity(p.path);
        },
      ),
    );
    return () => {
      unlistens.forEach((u) => {
        u.then((f) => f());
      });
    };
  }, [recentProjects, setSessionGenerating, touchProjectActivity]);

  const sortedProjects = [...recentProjects].sort(
    (a, b) => b.lastMessageAt - a.lastMessageAt,
  );

  return (
    <div className="flex h-full flex-col bg-[#0b0c0e] shadow-[var(--al-shadow-r)]">
      <div className="flex-1 overflow-y-auto py-1.5">
        {sortedProjects.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-600">
            No projects yet
          </div>
        ) : (
          sortedProjects.map((p) => (
            <ProjectRow
              key={p.path}
              project={p}
              active={p.path === projectRoot}
              onClick={() => openProject(p.path)}
            />
          ))
        )}
      </div>
    </div>
  );
}
