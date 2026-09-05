const tabs = ["lib.rs"];

export default function EditorArea() {
  return (
    <div className="flex h-full flex-col bg-[#101114]">
      <div className="flex h-9 items-center border-b border-[#26272c] bg-[#0b0c0e]">
        {tabs.map((tab) => (
          <div
            key={tab}
            className="flex h-full items-center border-r border-[#26272c] px-4 text-sm text-zinc-200 bg-[#101114]"
          >
            {tab}
          </div>
        ))}
      </div>
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Editor goes here (CodeMirror wired in milestone 2)
      </div>
    </div>
  );
}
