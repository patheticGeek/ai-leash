import { useAppStore } from "../store";

export default function StatusBar() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const ollamaConnected = useAppStore((s) => s.ollamaConnected);

  const folderName = projectRoot?.split("/").filter(Boolean).pop();

  return (
    <div className="flex h-6 items-center justify-between bg-[#17181c] border-t border-[#26272c] px-3 text-xs text-zinc-500">
      <span>{folderName ?? "ai-leash"}</span>
      <span className="flex items-center gap-1.5">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            ollamaConnected === true
              ? "bg-emerald-500"
              : ollamaConnected === false
                ? "bg-red-500"
                : "bg-zinc-600"
          }`}
        />
        ollama ·{" "}
        {ollamaConnected === null
          ? "checking…"
          : ollamaConnected
            ? "connected"
            : "disconnected"}
      </span>
    </div>
  );
}
