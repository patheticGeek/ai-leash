import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPanel() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<string[]>("list_ollama_models")
      .then((m) => {
        setModels(m);
        if (m.length) setModel(m[0]);
      })
      .catch(() =>
        setOllamaError(
          "Could not reach Ollama at localhost:11434. Is `ollama serve` running?",
        ),
      );
  }, []);

  useEffect(() => {
    const unlistenChunk = listen<string>(`chat://${sessionId}/chunk`, (e) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + e.payload },
          ];
        }
        return [...prev, { role: "assistant", content: e.payload }];
      });
    });
    const unlistenDone = listen(`chat://${sessionId}/done`, () =>
      setSending(false),
    );
    const unlistenError = listen<string>(`chat://${sessionId}/error`, (e) => {
      setOllamaError(e.payload);
      setSending(false);
    });
    return () => {
      unlistenChunk.then((f) => f());
      unlistenDone.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending || !model) return;
    setInput("");
    setOllamaError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);
    try {
      await invoke("send_prompt", { sessionId, model, message: text });
    } catch (e) {
      setOllamaError(String(e));
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#0e0f12] border-l border-[#26272c]">
      <div className="flex h-9 items-center justify-between border-b border-[#26272c] px-3">
        <span className="text-sm font-medium text-zinc-200">Agent</span>
        <select
          value={model}
          onChange={(e) => setModel(e.currentTarget.value)}
          className="bg-[#17181c] border border-[#26272c] rounded text-xs text-zinc-300 px-2 py-1 outline-none"
        >
          {models.length === 0 && <option>no models</option>}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {messages.length === 0 && !ollamaError && (
          <div className="text-zinc-500">
            Ask the agent anything about this project.
          </div>
        )}
        {ollamaError && (
          <div className="rounded border border-red-900/50 bg-red-950/30 px-3 py-2 text-red-300 text-xs">
            {ollamaError}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-zinc-200" : "text-zinc-300"}>
            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mb-0.5">
              {m.role === "user" ? "you" : "agent"}
            </div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {sending && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="text-zinc-600 text-xs">thinking…</div>
        )}
      </div>
      <div className="border-t border-[#26272c] p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask the agent..."
          rows={3}
          className="w-full resize-none rounded-md bg-[#17181c] border border-[#26272c] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#3a5f8f]"
        />
      </div>
    </div>
  );
}
