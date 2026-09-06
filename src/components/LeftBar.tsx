import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useAppStore, type RecentProject } from "../store";

function Logo() {
  return (
    <svg width="98" height="20" viewBox="0 0 98 20" className="shrink-0">
      <defs>
        <linearGradient id="ai-leash-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="25%" stopColor="#eab308" />
          <stop offset="50%" stopColor="#22c55e" />
          <stop offset="75%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <text
        x="2"
        y="15"
        fontSize="14"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        <tspan fill="url(#ai-leash-gradient)">ai</tspan>
        <tspan fill="#e4e4e7"> leash</tspan>
      </text>
    </svg>
  );
}

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

  return (
    <div
      onClick={onClick}
      title={project.path}
      className={`mx-1.5 mb-0.5 flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-default ${
        active ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {generating && (
        <span
          title="Generating…"
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500"
        />
      )}
    </div>
  );
}

export default function LeftBar() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const openProject = useAppStore((s) => s.openProject);
  const setSessionGenerating = useAppStore((s) => s.setSessionGenerating);
  const touchProjectActivity = useAppStore((s) => s.touchProjectActivity);
  const setSettingsModalOpen = useAppStore((s) => s.setSettingsModalOpen);

  // Always mounted regardless of which project (if any) is currently open,
  // so a session's `generating` state is tracked even while you're looking
  // at a different project entirely — see `run_with_cancellation` in
  // chat.rs, the single place this event is emitted from. A turn starting
  // is also what bumps the project's sort order (`touchProjectActivity`),
  // not merely opening/switching to it — otherwise clicking around the
  // sidebar to look at things would keep reshuffling it.
  useEffect(() => {
    const unlistens = recentProjects.map((p) =>
      listen<boolean>(`chat://${p.path}/generating`, (e) => {
        setSessionGenerating(p.path, e.payload);
        if (e.payload) touchProjectActivity(p.path);
      }),
    );
    return () => {
      unlistens.forEach((u) => u.then((f) => f()));
    };
  }, [recentProjects, setSessionGenerating, touchProjectActivity]);

  const sortedProjects = [...recentProjects].sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  async function pickProject() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      await openProject(dir);
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#0b0c0e] border-r border-[#26272c]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#26272c] px-2.5">
        <Logo />
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSettingsModalOpen(true)}
            title="Provider settings"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
          >
            ⚙
          </button>
          <button
            onClick={pickProject}
            title="Open project"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
          >
            +
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1.5">
        {sortedProjects.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-600">No projects yet</div>
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
