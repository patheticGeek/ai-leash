import { useState } from "react";
import { Button } from "@/ui/button";
import type { DirEntryInfo } from "../../../lib/tauriApi";
import { useActiveCheckoutPath } from "../../../lib/useActiveCheckoutPath";
import { useAppStore } from "../../../store";
import { useFsDir } from "./useFsDir";

function Node({
  entry,
  depth,
  checkoutPath,
}: {
  entry: DirEntryInfo;
  depth: number;
  checkoutPath: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const openFile = useAppStore((s) => s.openFile);
  const activePath = useAppStore((s) => s.activePath);
  const { data: children } = useFsDir(
    checkoutPath,
    entry.path,
    entry.isDir && expanded,
  );

  function toggle() {
    if (!entry.isDir) {
      openFile(entry.path, entry.name);
      return;
    }
    setExpanded((e) => !e);
  }

  return (
    <div>
      <Button
        variant="menu-item"
        size="none"
        data-active={entry.path === activePath}
        className="flex w-full items-center justify-start gap-1.5 px-2 py-1 text-sm rounded-md cursor-default select-none text-zinc-300 data-[active=true]:text-zinc-100"
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
            <Node
              key={child.path}
              entry={child}
              depth={depth + 1}
              checkoutPath={checkoutPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree() {
  // The tree follows whichever checkout the focused conversation is pinned
  // to (primary or worktree), not just whichever project is globally
  // "open" — see `commands.rs`'s `list_dir` doc comment.
  const checkoutPath = useActiveCheckoutPath();
  const { data: rootEntries } = useFsDir(checkoutPath);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto pb-2">
        {!checkoutPath
          ? null
          : (rootEntries ?? []).map((entry) => (
              <Node
                key={entry.path}
                entry={entry}
                depth={0}
                checkoutPath={checkoutPath}
              />
            ))}
      </div>
    </div>
  );
}
