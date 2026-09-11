import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import { api } from "../../../lib/tauriApi";

export default function CrashLogTab() {
  const [log, setLog] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getCrashLog().then(setLog);
  }, []);

  async function refresh() {
    setLog(await api.getCrashLog());
  }

  async function clear() {
    await api.clearCrashLog();
    setLog("");
  }

  async function copy() {
    if (!log) return;
    await navigator.clipboard.writeText(log);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Crash log
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={refresh}>
            <RefreshCw size={13} />
            Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={copy} disabled={!log}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="danger" size="sm" onClick={clear} disabled={!log}>
            <Trash2 size={13} />
            Clear
          </Button>
        </div>
      </div>
      <div className="text-xs text-zinc-600">
        Backend panics and frontend errors (uncaught exceptions, unhandled
        promise rejections, React crashes) are appended here as they happen —
        including ones from a previous run, so you can find out what happened
        after restarting the app.
      </div>
      <pre className="flex-1 select-text overflow-auto whitespace-pre-wrap rounded-md bg-[#0e0f12] p-2.5 text-xs text-zinc-400 shadow-[var(--al-shadow)]">
        {log === null ? "Loading…" : log === "" ? "No crashes logged." : log}
      </pre>
    </div>
  );
}
