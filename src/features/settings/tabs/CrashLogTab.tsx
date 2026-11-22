import { Button } from "@astryxdesign/core/Button";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import { api } from "../../../lib/tauriApi";

export default function CrashLogTab() {
  const [log, setLog] = useState<string | null>(null);
  const { copy, copied } = useCopyToClipboard();

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

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Crash log
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            label="Refresh"
            icon={<RefreshCw size={13} />}
            onClick={refresh}
          />
          <Button
            variant="secondary"
            size="sm"
            label={copied ? "Copied" : "Copy"}
            icon={copied ? <Check size={13} /> : <Copy size={13} />}
            onClick={() => log && copy(log)}
            isDisabled={!log}
          />
          <Button
            variant="danger"
            size="sm"
            label="Clear"
            icon={<Trash2 size={13} />}
            onClick={clear}
            isDisabled={!log}
          />
        </div>
      </div>
      <div className="text-xs text-zinc-600">
        Backend panics and frontend errors (uncaught exceptions, unhandled
        promise rejections, React crashes) are appended here as they happen —
        including ones from a previous run, so you can find out what happened
        after restarting the app.
      </div>
      <pre className="flex-1 select-text overflow-auto whitespace-pre-wrap rounded-md bg-sunken p-2.5 text-code text-zinc-400">
        {log === null ? "Loading…" : log === "" ? "No crashes logged." : log}
      </pre>
    </div>
  );
}
