import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import { api, type DirEntryInfo } from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";

function Node({ entry, depth }: { entry: DirEntryInfo; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntryInfo[] | null>(null);
  const openFile = useAppStore((s) => s.openFile);
  const activePath = useAppStore((s) => s.activePath);
  const sessionId = useAppStore((s) => s.activeSessionId);

  async function toggle() {
    if (!entry.isDir) {
      openFile(entry.path, entry.name);
      return;
    }
    if (!expanded && children === null && sessionId) {
      setChildren(await api.listDir(sessionId, entry.path));
    }
    setExpanded((e) => !e);
  }

  useEffect(() => {
    if (!expanded || !sessionId) return;
    const unlisten = listen("fs://changed", () => {
      api.listDir(sessionId, entry.path).then(setChildren);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [expanded, entry.path, sessionId]);

  return (
    <div>
      <Button
        variant="unstyled"
        size="none"
        className={`flex w-full items-center justify-start gap-1.5 px-2 py-1 text-sm hover:bg-white/5 rounded-md cursor-default select-none text-left ${
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
  // The tree follows whichever checkout the focused conversation is pinned
  // to (primary or worktree), not just whichever project is globally
  // "open" — see `commands.rs`'s `get_session_root`.
  const sessionId = useAppStore((s) => s.activeSessionId);
  const [rootEntries, setRootEntries] = useState<DirEntryInfo[]>([]);

  useEffect(() => {
    if (sessionId) {
      api.listDir(sessionId).then(setRootEntries);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const unlisten = listen("fs://changed", () => {
      api.listDir(sessionId).then(setRootEntries);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [sessionId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto pb-2">
        {!sessionId
          ? null
          : rootEntries.map((entry) => (
              <Node key={entry.path} entry={entry} depth={0} />
            ))}
      </div>
    </div>
  );
}
