import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface PermissionRequestPayload {
  id: string;
  kind: "shell" | "edit";
  title: string;
  detail: string;
}

export default function PermissionModal() {
  const [request, setRequest] = useState<PermissionRequestPayload | null>(null);

  useEffect(() => {
    const unlisten = listen<PermissionRequestPayload>(
      "permission://request",
      (e) => setRequest(e.payload),
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  async function respond(approved: boolean) {
    if (!request) return;
    const id = request.id;
    setRequest(null);
    await invoke("respond_permission", { id, approved });
  }

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[70vh] w-[560px] flex-col rounded-lg border border-[#26272c] bg-[#141518] shadow-2xl">
        <div className="border-b border-[#26272c] px-4 py-3">
          <div className="text-sm font-medium text-zinc-100">{request.title}</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {request.kind === "shell"
              ? "The agent wants to run a shell command"
              : "The agent wants to edit this file"}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3 font-mono text-xs">
          {request.kind === "edit"
            ? request.detail.split("\n").map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("+ ")
                      ? "text-emerald-400"
                      : line.startsWith("- ")
                        ? "text-red-400"
                        : "text-zinc-500"
                  }
                >
                  {line || " "}
                </div>
              ))
            : (
                <pre className="whitespace-pre-wrap text-zinc-300">{request.detail}</pre>
              )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#26272c] px-4 py-3">
          <button
            onClick={() => respond(false)}
            className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Deny
          </button>
          <button
            onClick={() => respond(true)}
            className="rounded bg-[#3a5f8f] px-3 py-1.5 text-sm text-white hover:bg-[#4a6f9f]"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
