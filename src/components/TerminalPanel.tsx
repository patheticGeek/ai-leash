export default function TerminalPanel() {
  return (
    <div className="flex h-full flex-col bg-[#0b0c0e] border-t border-[#26272c]">
      <div className="flex h-8 items-center gap-4 px-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase border-b border-[#26272c]">
        <span className="text-zinc-200 normal-case font-normal text-sm">
          Terminal
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 font-mono text-sm text-zinc-400">
        $ terminal wired in milestone 2 (portable-pty + xterm.js)
      </div>
    </div>
  );
}
