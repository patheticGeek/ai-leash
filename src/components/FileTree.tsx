import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { api, type DirEntryInfo } from "../lib/tauriApi";
import { useAppStore } from "../store";
import Button from "./Button";

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
      <Button
        variant="unstyled"
        size="none"
        className={`flex w-full items-center gap-1.5 px-2 py-1 text-sm hover:bg-white/5 rounded cursor-default select-none text-left ${
          entry.path === activePath
            ? "bg-white/10 text-zinc-100"
            : "text-zinc-300"
        }`}
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={toggle}
      >
        <span className="text-zinc-500 w-3 inline-block">
          {entry.isDir ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span>{entry.name}</span>
      </Button>
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

export default function FileTree() {
  const projectRoot = useAppStore((s) => s.projectRoot);
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto pb-2">
        {!projectRoot
          ? null
          : rootEntries.map((entry) => (
              <Node key={entry.path} entry={entry} depth={0} />
            ))}
      </div>
    </div>
  );
}
