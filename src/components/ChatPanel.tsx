import { useState } from "react";

export default function ChatPanel() {
  const [input, setInput] = useState("");

  return (
    <div className="flex h-full flex-col bg-[#0e0f12] border-l border-[#26272c]">
      <div className="flex h-9 items-center justify-between border-b border-[#26272c] px-3">
        <span className="text-sm font-medium text-zinc-200">Agent</span>
        <select className="bg-[#17181c] border border-[#26272c] rounded text-xs text-zinc-300 px-2 py-1 outline-none">
          <option>Ollama (llama3)</option>
        </select>
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-sm text-zinc-500">
        No conversation yet. Built-in agent runtime is wired in milestone 3.
      </div>
      <div className="border-t border-[#26272c] p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          placeholder="Ask the agent..."
          rows={3}
          className="w-full resize-none rounded-md bg-[#17181c] border border-[#26272c] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#3a5f8f]"
        />
      </div>
    </div>
  );
}
