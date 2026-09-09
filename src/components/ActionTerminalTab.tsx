import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { api } from "../lib/tauriApi";

function base64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Attaches to an Action's process rather than spawning one — unlike
// TerminalPanel, the pty (if any) is already running by the time this
// mounts (started via the Actions tab's Run button, or by an agent's
// run_action tool call). Replays buffered output on open via
// action_backlog, then follows the live `pty://{ptyId}/data` stream for
// whichever pty is currently backing this action, re-attaching whenever
// that changes (a fresh Run after a Stop gets a new ptyId).
export default function ActionTerminalTab({ actionId }: { actionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const attachedPtyIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily: "Menlo, Consolas, monospace",
      theme: {
        background: "#0b0c0e",
        foreground: "#d4d4d8",
        cursor: "#d4d4d8",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      if (attachedPtyIdRef.current) {
        api.ptyResize(attachedPtyIdRef.current, term.cols, term.rows);
      }
    });
    resizeObserver.observe(containerRef.current);

    let disposed = false;

    async function attach(ptyId: string) {
      unlistenRef.current?.();
      attachedPtyIdRef.current = ptyId;
      const backlog = await api.actionBacklog(actionId);
      if (disposed) return;
      term.reset();
      term.write(base64ToBytes(backlog));
      unlistenRef.current = await listen<string>(`pty://${ptyId}/data`, (e) => {
        term.write(base64ToBytes(e.payload));
      });
    }

    function detach() {
      unlistenRef.current?.();
      unlistenRef.current = null;
      attachedPtyIdRef.current = null;
    }

    async function sync() {
      const actions = await api.listActions();
      if (disposed) return;
      const action = actions.find((a) => a.id === actionId);
      const ptyId = action?.running ? (action.ptyId ?? null) : null;
      if (ptyId !== attachedPtyIdRef.current) {
        if (ptyId) {
          await attach(ptyId);
        } else {
          detach();
        }
      }
    }

    sync();
    const pollId = setInterval(sync, 2000);

    const onData = term.onData((data) => {
      if (attachedPtyIdRef.current)
        api.ptyWrite(attachedPtyIdRef.current, data);
    });

    return () => {
      disposed = true;
      clearInterval(pollId);
      resizeObserver.disconnect();
      unlistenRef.current?.();
      onData.dispose();
      term.dispose();
    };
  }, [actionId]);

  return <div ref={containerRef} className="h-full bg-[#0b0c0e] px-2 py-1" />;
}
