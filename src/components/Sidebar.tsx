import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { api, type DirEntryInfo } from "../lib/tauriApi";
import { useAppStore } from "../store";

function Node({ entry, depth }: { entry: DirEntryInfo; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntryInfo[] | null>(null);
  const openFile = useAppStore((s) => s.openFile);
  const activePath = useAppStore((s) => s.activePath);

  async function toggle() {
    if (!entry.isDir) {
      openFile(entry.path, entry.name);
      return;
    }
    if (!expanded && children === null) {
      setChildren(await api.listDir(entry.path));
    }
    setExpanded((e) => !e);
  }

  useEffect(() => {
    if (!expanded) return;
    const unlisten = listen("fs://changed", () => {
      api.listDir(entry.path).then(setChildren);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [expanded, entry.path]);

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-white/5 rounded cursor-default select-none ${
          entry.path === activePath ? "bg-white/10 text-zinc-100" : "text-zinc-300"
        }`}
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={toggle}
      >
        <span className="text-zinc-500 w-3 inline-block">
          {entry.isDir ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span>{entry.name}</span>
      </div>
      {entry.isDir && expanded && children && (
        <div>
          {children.map((child) => (
            <Node key={child.path} entry={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const openProject = useAppStore((s) => s.openProject);
  const [rootEntries, setRootEntries] = useState<DirEntryInfo[]>([]);

  useEffect(() => {
    if (projectRoot) {
      api.listDir().then(setRootEntries);
    }
  }, [projectRoot]);

  useEffect(() => {
    if (!projectRoot) return;
    const unlisten = listen("fs://changed", () => {
      api.listDir().then(setRootEntries);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [projectRoot]);

  async function openFolder() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      await openProject(dir);
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#0b0c0e] border-r border-[#26272c]">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Explorer
        </span>
        {projectRoot && (
          <button
            onClick={openFolder}
            className="text-xs text-zinc-500 hover:text-zinc-200"
          >
            Open
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto pb-2">
        {!projectRoot ? (
          <div className="px-3 py-6 text-center">
            <button
              onClick={openFolder}
              className="rounded bg-[#17181c] border border-[#26272c] px-3 py-1.5 text-sm text-zinc-300 hover:border-[#3a5f8f]"
            >
              Open Folder
            </button>
          </div>
        ) : (
          rootEntries.map((entry) => (
            <Node key={entry.path} entry={entry} depth={0} />
          ))
        )}
      </div>
    </div>
  );
}
