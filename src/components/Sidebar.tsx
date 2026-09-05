import { useState } from "react";

interface FileNode {
  name: string;
  isDir: boolean;
  children?: FileNode[];
}

const placeholderTree: FileNode[] = [
  {
    name: "src",
    isDir: true,
    children: [
      { name: "main.rs", isDir: false },
      { name: "lib.rs", isDir: false },
    ],
  },
  { name: "AGENTS.md", isDir: false },
  { name: "Cargo.toml", isDir: false },
];

function Node({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 py-1 text-sm text-zinc-300 hover:bg-white/5 rounded cursor-default select-none"
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={() => node.isDir && setOpen((o) => !o)}
      >
        <span className="text-zinc-500 w-3 inline-block">
          {node.isDir ? (open ? "▾" : "▸") : ""}
        </span>
        <span>{node.name}</span>
      </div>
      {node.isDir && open && node.children && (
        <div>
          {node.children.map((child) => (
            <Node key={child.name} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  return (
    <div className="flex h-full flex-col bg-[#0b0c0e] border-r border-[#26272c]">
      <div className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        Explorer
      </div>
      <div className="flex-1 overflow-y-auto pb-2">
        {placeholderTree.map((node) => (
          <Node key={node.name} node={node} depth={0} />
        ))}
      </div>
    </div>
  );
}
