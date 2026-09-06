import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store";

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

export default function LeftBar() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const openProject = useAppStore((s) => s.openProject);

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
        <button
          onClick={pickProject}
          title="Open project"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1.5">
        {recentProjects.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-600">No projects yet</div>
        ) : (
          recentProjects.map((p) => (
            <div
              key={p.path}
              onClick={() => openProject(p.path)}
              title={p.path}
              className={`mx-1.5 mb-0.5 truncate rounded px-2 py-1.5 text-sm cursor-default ${
                p.path === projectRoot
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              }`}
            >
              {p.name}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
